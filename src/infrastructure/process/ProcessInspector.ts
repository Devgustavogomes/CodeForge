import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import { ProcessIdentity, ProcessInspection, ProcessRecord } from "./ProcessExecutor.js";

export interface ProcessSnapshot {
  host: string;
  bootId: string;
  processes: ProcessIdentity[];
  /** True only when inherited ownership tokens have been inspected across all processes. */
  tokensComplete: boolean;
  diagnostics: string[];
}
export type SnapshotReader = () => Promise<ProcessSnapshot>;

export async function readProcessSnapshot(): Promise<ProcessSnapshot> {
  if (process.platform === "win32") {
    const { execFile } = await import("node:child_process");
    const execute = promisify(execFile);
    // CreationDate protects against Windows PID/parent-PID reuse. CIM failures are not absence.
    const script = '$ErrorActionPreference="Stop"; $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString("o"); $items=@(Get-CimInstance Win32_Process | ForEach-Object { if ($_.CreationDate) { @{pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; birth=$_.CreationDate.ToUniversalTime().ToString("o")} } }); @{bootId=$boot; processes=$items} | ConvertTo-Json -Depth 4 -Compress';
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
    const data = JSON.parse(stdout) as Pick<ProcessSnapshot, "bootId" | "processes">;
    if (!data.bootId || !Array.isArray(data.processes) || data.processes.some(p => !p.birth)) {
      throw new Error("Windows CIM returned incomplete creation evidence");
    }
    return { ...data, host: os.hostname(), tokensComplete: false, diagnostics: [] };
  }
  if (process.platform !== "linux") throw new Error(
    "Process ownership inspection is unavailable on this platform; preserve the worktree and inspect it manually.");
  const bootId = (await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
  const result: ProcessSnapshot = { host: os.hostname(), bootId, processes: [], tokensComplete: true, diagnostics: [] };
  for (const pid of (await fs.readdir("/proc")).filter(p => /^\d+$/.test(p))) {
    try {
      const stat = await fs.readFile("/proc/" + pid + "/stat", "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (fields[0] === "Z") continue; // Zombies cannot occupy a worktree.
      const identity: ProcessIdentity = { pid: Number(pid), parentPid: Number(fields[1]), birth: fields[19] };
      result.processes.push(identity);
      const env = await fs.readFile("/proc/" + pid + "/environ", "utf8");
      identity.token = env.split("\0").find(e => e.startsWith("CODEFORGE_PROCESS_TOKEN="))?.slice(24);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ESRCH") {
        result.tokensComplete = false;
        result.diagnostics.push("Cannot inspect /proc/" + pid + ": " + String(error));
      }
    }
  }
  return result;
}

export function ownedProcesses(record: ProcessRecord, snapshot: ProcessSnapshot): ProcessIdentity[] {
  const owned = snapshot.processes.filter(p => p.token === record.token ||
    record.identities.some(old => p.pid === old.pid && p.birth === old.birth));
  // Only follow a live, identified ancestor, never the PID of an exited/reused parent.
  let added = true;
  while (added) {
    added = false;
    for (const p of snapshot.processes) {
      if (!owned.includes(p) && owned.some(parent => p.parentPid === parent.pid &&
          (/^\d+$/.test(p.birth) && /^\d+$/.test(parent.birth) ? BigInt(p.birth) >= BigInt(parent.birth) : p.birth >= parent.birth))) { owned.push(p); added = true; }
    }
  }
  return owned;
}

export async function inspectProcess(record: ProcessRecord, read: SnapshotReader): Promise<ProcessInspection> {
  const unknown = (diagnostics: string[]): ProcessInspection => ({ status: "unknown", safeToReuse: false, processes: [], diagnostics });
  if (record.host !== os.hostname()) return unknown(["Ownership belongs to another host; inspect that host before reuse."]);
  if (record.status === "launch-failed" && !record.pid) {
    return { status: "interrupted", safeToReuse: true, processes: [], diagnostics: record.diagnostics };
  }
  try {
    for (let pass = 0; pass < 2; pass++) {
      const snapshot = await read();
      if (snapshot.host !== record.host) return unknown(["Inspection host differs from the recorded host."]);
      if (record.bootId && record.bootId !== snapshot.bootId) {
        return { status: "interrupted", safeToReuse: true, processes: [], diagnostics: ["The host restarted; prior processes cannot survive."] };
      }
      const processes = ownedProcesses(record, snapshot);
      if (processes.length) return { status: "active", safeToReuse: false, processes, diagnostics: snapshot.diagnostics };
      if (!record.bootId || !snapshot.tokensComplete || record.status === "launching") {
        return unknown([...snapshot.diagnostics,
          "No identified process is visible, but surviving descendants cannot be excluded. Preserve the environment; inspect ownership or restart the host."]);
      }
      // Re-enumerate after observing absence so children born while the first snapshot was
      // collected cannot disappear between the PID listing and their parent's exit.
      if (pass === 1) return { status: "interrupted", safeToReuse: true, processes: [], diagnostics: snapshot.diagnostics };
    }
    return unknown(["Process inspection did not establish absence."]);
  } catch (error) {
    return unknown(["Process inspection failed: " + String(error) + ". Preserve the environment and retry inspection."]);
  }
}
