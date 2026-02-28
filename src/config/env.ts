import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  AGENT_ID: z.string().min(5),
  AGENT_API_KEY: z.string().min(10),
  AGENT_PORT: z.coerce.number().int().positive().default(4800),
  AGENT_VERSION: z.string().min(1).default("0.1.0"),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  METRICS_INTERVAL_MS: z.coerce.number().int().positive().default(30000)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errorText = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid agent environment:\n${errorText}`);
}

export const env = parsed.data;
