import { env } from "../config/env";
import { runCommandStreaming } from "./commandRunner";
import { collectMetrics } from "../utils/metrics";

type RuntimeState = {
  connected: boolean;
  lastConnectedAt: Date | null;
  lastPollAt: Date | null;
  pollErrors: number;
};

const state: RuntimeState = {
  connected: false,
  lastConnectedAt: null,
  lastPollAt: null,
  pollErrors: 0
};

export function getAgentState(): RuntimeState {
  return { ...state };
}

async function pushMetrics(): Promise<void> {
  try {
    const metrics = await collectMetrics();
    await fetch(`${env.APP_URL}/api/agents/metrics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: env.AGENT_ID,
        apiKey: env.AGENT_API_KEY,
        metrics
      })
    });
  } catch {
    // metrics push errors are non-fatal
  }
}

export function startSocketClient(): void {
  state.connected = true;
  state.lastConnectedAt = new Date();

  // push an initial metrics snapshot then repeat on interval
  void pushMetrics();
  setInterval(() => { void pushMetrics(); }, env.METRICS_INTERVAL_MS);

  const loop = async (): Promise<void> => {
    state.lastPollAt = new Date();

    try {
      const nextResponse = await fetch(`${env.APP_URL}/api/agents/commands/next`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: env.AGENT_ID,
          apiKey: env.AGENT_API_KEY
        })
      });

      if (!nextResponse.ok) {
        state.pollErrors += 1;
        return;
      }

      const nextData = (await nextResponse.json()) as {
        command: { id: string; text: string } | null;
      };

      if (!nextData.command) {
        state.pollErrors = 0;
        return;
      }

      const commandId = nextData.command.id;
      const result = await runCommandStreaming({
        commandId,
        command: nextData.command.text,
        timeoutMs: env.COMMAND_TIMEOUT_MS,
        onOutput: async (chunk) => {
          await fetch(`${env.APP_URL}/api/agents/commands/update`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              agentId: env.AGENT_ID,
              apiKey: env.AGENT_API_KEY,
              commandId,
              status: "running",
              output: chunk
            })
          });
        }
      });

      await fetch(`${env.APP_URL}/api/agents/commands/update`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: env.AGENT_ID,
          apiKey: env.AGENT_API_KEY,
          commandId,
          status: result.status,
          error: result.error
        })
      });

      state.pollErrors = 0;
    } catch {
      state.pollErrors += 1;
    }
  };

  setInterval(() => {
    void loop();
  }, env.POLL_INTERVAL_MS);

  void loop();
}
