import { spawn } from "child_process";

export type CommandResult = {
  status: "succeeded" | "failed" | "cancelled";
  error?: string;
};

export async function runCommandStreaming(input: {
  commandId: string;
  command: string;
  timeoutMs: number;
  onOutput: (chunk: string) => void;
}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const shell = process.platform === "win32" ? "powershell.exe" : "sh";
    const shellArgs = process.platform === "win32" ? ["-Command", input.command] : ["-lc", input.command];

    const child = spawn(shell, shellArgs, {
      windowsHide: true,
      env: process.env,
      cwd: process.cwd()
    });

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      resolve({ status: "failed", error: "Command timed out" });
    }, input.timeoutMs);

    child.stdout.on("data", (data) => {
      input.onOutput(data.toString());
    });

    child.stderr.on("data", (data) => {
      input.onOutput(data.toString());
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ status: "failed", error: error.message });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);

      if (timedOut) {
        return;
      }

      if (signal) {
        resolve({ status: "cancelled", error: `Signal: ${signal}` });
        return;
      }

      resolve({ status: code === 0 ? "succeeded" : "failed", error: code === 0 ? undefined : `Exit code ${code}` });
    });
  });
}
