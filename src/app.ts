import express from "express";
import { env } from "./config/env";
import { getAgentState } from "./services/agentSocketClient";
import { getSystemMetadata } from "./utils/system";

export const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/status", (_req, res) => {
  res.status(200).json({
    agentId: env.AGENT_ID,
    backendUrl: env.APP_URL,
    version: env.AGENT_VERSION,
    system: getSystemMetadata(env.AGENT_VERSION),
    runtime: getAgentState()
  });
});
