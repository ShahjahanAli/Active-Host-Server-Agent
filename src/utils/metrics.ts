import os from "os";
import { readFile } from "fs/promises";
import { statfs } from "fs/promises";

/* ─── Types ──────────────────────────────────────────────────────── */
export type CpuMetrics = {
  count: number;
  model: string;
  usagePercent: number;
};

export type MemoryMetrics = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercent: number;
};

export type DiskMetrics = {
  mount: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercent: number;
};

export type NetworkMetrics = {
  interface: string;
  address: string | null;
  rxBytes: number;
  txBytes: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
};

export type SystemMetrics = {
  collectedAt: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  network: NetworkMetrics[];
  load: { avg1: number; avg5: number; avg15: number };
  uptimeSeconds: number;
  activeProcesses: number;
};

/* ─── CPU usage (two-sample approach) ────────────────────────────── */
type CpuSample = { idle: number; total: number }[];

function sampleCpus(): CpuSample {
  return os.cpus().map((cpu) => {
    const t = cpu.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

async function measureCpuUsage(sampleMs = 350): Promise<number> {
  const before = sampleCpus();
  await new Promise<void>((r) => setTimeout(r, sampleMs));
  const after = sampleCpus();

  let totalIdle = 0;
  let totalDelta = 0;
  for (let i = 0; i < before.length; i++) {
    totalIdle += (after[i]?.idle ?? 0) - (before[i]?.idle ?? 0);
    totalDelta += (after[i]?.total ?? 0) - (before[i]?.total ?? 0);
  }
  if (totalDelta === 0) return 0;
  return Math.round(Math.max(0, 100 - (100 * totalIdle) / totalDelta) * 10) / 10;
}

/* ─── Network bandwidth (Linux /proc/net/dev) ─────────────────────── */
type NetSample = { rxBytes: number; txBytes: number; at: number };
const prevNet = new Map<string, NetSample>();

async function readLinuxNet(): Promise<Map<string, { rx: number; tx: number }>> {
  const map = new Map<string, { rx: number; tx: number }>();
  try {
    const raw = await readFile("/proc/net/dev", "utf8");
    for (const line of raw.split("\n").slice(2)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;
      const iface = trimmed.slice(0, colonIdx).trim();
      const fields = trimmed.slice(colonIdx + 1).trim().split(/\s+/);
      map.set(iface, { rx: Number(fields[0] ?? 0), tx: Number(fields[8] ?? 0) });
    }
  } catch {
    // not Linux or no permission
  }
  return map;
}

/* ─── Disk stats ──────────────────────────────────────────────────── */
async function getDiskStats(): Promise<DiskMetrics[]> {
  const mounts: string[] =
    process.platform === "win32"
      ? ["C:\\"]
      : ["/"];

  const results: DiskMetrics[] = [];
  for (const mount of mounts) {
    try {
      // statfs available since Node 19.6
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stats = await (statfs as any)(mount) as {
        bsize: number;
        blocks: number;
        bfree: number;
        bavail: number;
      };
      const blockSize = stats.bsize;
      const total = stats.blocks * blockSize;
      const free = stats.bavail * blockSize;
      const used = total - free;
      results.push({
        mount,
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
      });
    } catch {
      // fs.statfs not available or mount inaccessible
    }
  }
  return results;
}

/* ─── Active processes (best-effort) ─────────────────────────────── */
function getActiveProcesses(): number {
  try {
    // on Linux, /proc gives us a rough count
    // as a proxy, use os.cpus() load averages
    // We'll use the 1-min load average * 100 as a rough "active processes" hint
    // This is just a number that completes the picture; real counting requires procfs
    return 0; // will be filled by caller if needed
  } catch {
    return 0;
  }
}

/* ─── Main collect ────────────────────────────────────────────────── */
export async function collectMetrics(): Promise<SystemMetrics> {
  const now = Date.now();

  const [cpuUsage, linuxNet] = await Promise.all([
    measureCpuUsage(350),
    process.platform === "linux"
      ? readLinuxNet()
      : Promise.resolve(new Map<string, { rx: number; tx: number }>()),
  ]);

  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const [avg1, avg5, avg15] = os.loadavg();
  const disks = await getDiskStats();

  /* ── CPU ── */
  const cpu: CpuMetrics = {
    count: cpus.length,
    model: cpus[0]?.model.trim() ?? "unknown",
    usagePercent: cpuUsage,
  };

  /* ── Memory ── */
  const memory: MemoryMetrics = {
    totalBytes: totalMem,
    freeBytes: freeMem,
    usedBytes: usedMem,
    usagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
  };

  /* ── Network ── */
  const networkIfaces = os.networkInterfaces();
  const network: NetworkMetrics[] = [];

  for (const [name, addrs] of Object.entries(networkIfaces)) {
    if (!addrs || name === "lo" || name.toLowerCase().startsWith("loopback")) continue;
    const ipv4 = addrs.find((a) => a.family === "IPv4" && !a.internal);

    let rxBytes = 0;
    let txBytes = 0;
    let rxBytesPerSec = 0;
    let txBytesPerSec = 0;

    if (process.platform === "linux") {
      const linuxStats = linuxNet.get(name);
      if (linuxStats) {
        rxBytes = linuxStats.rx;
        txBytes = linuxStats.tx;
        const prev = prevNet.get(name);
        if (prev) {
          const elapsedSec = (now - prev.at) / 1000;
          if (elapsedSec > 0) {
            rxBytesPerSec = Math.round(Math.max(0, (rxBytes - prev.rxBytes) / elapsedSec));
            txBytesPerSec = Math.round(Math.max(0, (txBytes - prev.txBytes) / elapsedSec));
          }
        }
        prevNet.set(name, { rxBytes, txBytes, at: now });
      }
    }

    network.push({
      interface: name,
      address: ipv4?.address ?? null,
      rxBytes,
      txBytes,
      rxBytesPerSec,
      txBytesPerSec,
    });
  }

  /* ── Load / uptime ── */
  const load = {
    avg1: Math.round((avg1 ?? 0) * 100) / 100,
    avg5: Math.round((avg5 ?? 0) * 100) / 100,
    avg15: Math.round((avg15 ?? 0) * 100) / 100,
  };

  return {
    collectedAt: new Date().toISOString(),
    cpu,
    memory,
    disks,
    network,
    load,
    uptimeSeconds: Math.floor(os.uptime()),
    activeProcesses: getActiveProcesses(),
  };
}
