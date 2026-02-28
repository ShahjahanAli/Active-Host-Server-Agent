import { env } from "../config/env";
import { getSystemMetadata } from "../utils/system";

export async function registerAgent(): Promise<void> {
  const metadata = getSystemMetadata(env.AGENT_VERSION);

  const response = await fetch(`${env.APP_URL}/api/agents/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      agentId: env.AGENT_ID,
      apiKey: env.AGENT_API_KEY,
      hostname: metadata.hostname,
      os: metadata.os,
      ip: metadata.ip,
      version: metadata.version
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent register failed (${response.status}): ${text}`);
  }
}
