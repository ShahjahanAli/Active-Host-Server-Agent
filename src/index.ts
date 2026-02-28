#!/usr/bin/env node
import { app } from "./app";
import { env } from "./config/env";
import { registerAgent } from "./services/agentRegistry";
import { startSocketClient } from "./services/agentSocketClient";

async function start(): Promise<void> {
  await registerAgent();
  startSocketClient();

  app.listen(env.AGENT_PORT, () => {
    process.stdout.write(`Server agent listening on port ${env.AGENT_PORT}\n`);
  });
}

start().catch((error) => {
  process.stderr.write(`Failed to start agent: ${(error as Error).message}\n`);
  process.exit(1);
});
