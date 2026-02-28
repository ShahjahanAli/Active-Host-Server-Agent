import os from "os";

export function getSystemMetadata(version: string): {
  hostname: string;
  os: string;
  ip: string;
  version: string;
} {
  const networkInterfaces = os.networkInterfaces();
  const ipv4Address = Object.values(networkInterfaces)
    .flatMap((entry) => entry ?? [])
    .find((item) => item.family === "IPv4" && !item.internal)?.address;

  return {
    hostname: os.hostname(),
    os: `${os.platform()}-${os.release()}`,
    ip: ipv4Address ?? "unknown",
    version
  };
}
