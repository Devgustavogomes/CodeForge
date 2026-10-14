import { spawn, StdioOptions } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProcessExecOptions, ProcessExecutor, ProcessInspection, ProcessOutput,
  ProcessRecord, ProcessSpawnOptions } from "./ProcessExecutor.js";
import { inspectProcess, ownedProcesses, readProcessSnapshot, SnapshotReader } from "./ProcessInspector.js";

const MAX_BUFFER_CHARS = 5_000;

export class NodeProcessExecutor implements ProcessExecutor {
  constructor(
    private readonly onRecord?: (record: ProcessRecord) => void,
    private readonly readSnapshot: SnapshotReader = readProcessSnapshot,
  ) {}

  inspect(record: ProcessRecord): Promise<ProcessInspection> {
    return inspectProcess(record, this.readSnapshot);
  }

  exec(command: string, options?: ProcessExecOptions): Promise<ProcessOutput> {
    return this.spawn(command, [], { ...options, shell: typeof options?.shell === "string" ? options.shell : true,
      stdio: "pipe" });
  }

  async spawn(command: string, args: string[] = [], options: ProcessSpawnOptions = {}): Promise<ProcessOutput> {
    const record: ProcessRecord = {
      id: randomUUID(), token: randomUUID(), host: os.hostname(), platform: process.platform,
      command, args: [...args], cwd: path.resolve(options.cwd ?? process.cwd()),
      intentName: options.intentName, taskId: options.taskId, kind: options.kind,
      startedAt: new Date().toISOString(), status: "launching", identities: [], diagnostics: [],
    };
    const persist = () => {
      const observer = options.onProcessRecord ?? this.onRecord;
      observer?.(structuredClone(record));
    };
    // Persist the launch intent before side effects. If persistence fails, do not launch.
    persist();
    try { record.bootId = (await this.readSnapshot()).bootId; }
    catch (error) { record.diagnostics.push("Initial process inspection failed: " + String(error)); }
    persist();
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let persistenceFailed = false;
      let timer: NodeJS.Timeout | undefined;
      let poll: NodeJS.Timeout | undefined;
      const report = () => {
        try { persist(); } catch (error) {
          persistenceFailed = true;
          const message = "Process ownership persistence failed: " + String(error);
          record.diagnostics.push(message);
          stderr = (stderr + "\n" + message).slice(-MAX_BUFFER_CHARS);
        }
      };
      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: persistenceFailed ? null : exitCode, process: structuredClone(record) });
      };
      let child;
      try {
        child = spawn(command, args, { cwd: options.cwd,
          env: { ...process.env, ...options.env, CODEFORGE_PROCESS_TOKEN: record.token },
          stdio: options.stdio as StdioOptions, shell: options.shell });
      } catch (error) {
        record.status = "launch-failed";
        record.endedAt = new Date().toISOString();
        record.diagnostics.push("Process launch failed: " + String(error));
        stderr = record.diagnostics.join("\n");
        report(); finish(null); return;
      }
      let inspecting = false;
      const capture = async () => {
        if (inspecting) return;
        inspecting = true;
        try {
          const before = JSON.stringify(record.identities);
          const snapshot = await this.readSnapshot();
          // The live ChildProcess handle identifies the first root, even before birth evidence is saved.
          const root = snapshot.processes.find(p => p.pid === child.pid);
          // Windows kill(0) checks the original ChildProcess handle, rather than a reused PID.
          // Linux roots must carry the inherited token; a delayed snapshot alone is insufficient.
          const rootVerified = root && (process.platform === "linux" ? root.token === record.token :
            process.platform === "win32" && child.kill(0));
          if (root && rootVerified && record.status === "running" && !record.identities.some(p => p.pid === root.pid)) {
            record.identities.push(root);
          }
          for (const p of ownedProcesses(record, snapshot)) {
            if (!record.identities.some(old => old.pid === p.pid && old.birth === p.birth)) record.identities.push(p);
          }
          if (JSON.stringify(record.identities) !== before) report();
        } catch (error) {
          const message = "Process tree inspection failed: " + String(error);
          if (!record.diagnostics.includes(message)) record.diagnostics.push(message);
          report();
        } finally { inspecting = false; }
      };
      child.on("spawn", () => {
        record.pid = child.pid;
        record.status = "running";
        report();
        void capture();
        poll = setInterval(() => { void capture(); }, 250);
        poll.unref();
      });
      child.on("exit", (code) => {
        record.status = "exited";
        record.exitCode = code;
        record.endedAt = new Date().toISOString();
        if (poll) clearInterval(poll);
        report();
      });
      child.on("error", (error) => {
        if (!record.pid) record.status = "launch-failed";
        record.endedAt = new Date().toISOString();
        record.diagnostics.push("Process error: " + error.message);
        stderr = (stderr + "\n" + error.message).trim();
        if (poll) clearInterval(poll);
        report(); finish(null);
      });
      child.on("close", code => {
        if (poll) clearInterval(poll);
        if (record.status === "running") {
          record.status = "exited"; record.exitCode = code;
          record.endedAt = new Date().toISOString(); report();
        }
        finish(code);
      });
      child.stdout?.on("data", (data: Buffer | string) => {
        const chunk = data.toString(); options.onStdout?.(chunk);
        stdout = (stdout + chunk).slice(-MAX_BUFFER_CHARS);
      });
      child.stderr?.on("data", (data: Buffer | string) => {
        const chunk = data.toString(); options.onStderr?.(chunk);
        stderr = (stderr + chunk).slice(-MAX_BUFFER_CHARS);
      });
      child.stdin?.on("error", error => {
        if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
          record.diagnostics.push("Process stdin failed: " + error.message); report();
        }
      });
      if (options.pipePromptFile && child.stdin) {
        const stream = fs.createReadStream(options.pipePromptFile);
        stream.on("error", error => {
          stderr += "\nPrompt input failed: " + error.message;
          record.diagnostics.push("Prompt input failed: " + error.message); report();
          child.kill(); finish(null);
        });
        child.on("close", () => stream.destroy());
        stream.pipe(child.stdin);
      }
      if (options.pipeStdinContent !== undefined && child.stdin) child.stdin.end(options.pipeStdinContent);
      if (options.timeout && options.timeout > 0) {
        timer = setTimeout(() => {
          const message = "Process timed out after " + options.timeout + "ms";
          stderr = (stderr + "\n" + message).trim();
          record.diagnostics.push(message);
          // Killing a Windows shell does not kill its children. Keep evidence and inspect occupancy.
          try { child.kill(); } catch (error) { record.diagnostics.push("Process termination failed: " + String(error)); }
          report(); finish(null);
        }, options.timeout);
      }
    });
  }
}
