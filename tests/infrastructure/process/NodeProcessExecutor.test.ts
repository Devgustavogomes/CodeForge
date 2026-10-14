import { describe, it, expect } from "vitest";
import os from "node:os";
import { NodeProcessExecutor } from "../../../src/infrastructure/process/NodeProcessExecutor.js";
import { ProcessRecord } from "../../../src/infrastructure/process/ProcessExecutor.js";
import { readProcessSnapshot, ProcessSnapshot } from "../../../src/infrastructure/process/ProcessInspector.js";

const identity = { pid: 42, parentPid: 1, birth: "100", token: "owned" };
function record(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return { id: "operation", host: os.hostname(), platform: "linux", bootId: "boot", token: "owned",
    command: "agent", args: [], cwd: "/worktree", startedAt: new Date().toISOString(),
    status: "running", pid: 42, identities: [identity], diagnostics: [], ...overrides };
}
function executor(processes: ProcessSnapshot["processes"], tokensComplete = true, bootId = "boot") {
  return new NodeProcessExecutor(undefined, async () => ({
    host: os.hostname(), bootId, processes, tokensComplete, diagnostics: [],
  }));
}

describe("restart-safe process ownership", () => {
  it("identifies a live parent without an in-memory promise", async () => {
    expect(await executor([identity]).inspect(JSON.parse(JSON.stringify(record())))).toMatchObject({
      status: "active", safeToReuse: false, processes: [identity],
    });
  });
  it("finds a surviving subprocess after its parent exits", async () => {
    const child = { pid: 90, parentPid: 1, birth: "120", token: "owned" };
    expect(await executor([child]).inspect(record({ status: "exited", exitCode: 0 }))).toMatchObject({
      status: "active", safeToReuse: false, processes: [child],
    });
  });
  it("identifies a recorded Windows subprocess after its parent exits", async () => {
    const child = { pid: 90, parentPid: 42, birth: "2026-01-01T00:00:01Z" };
    expect(await executor([child], false).inspect(record({ platform: "win32", status: "exited",
      identities: [identity, child] }))).toMatchObject({ status: "active", safeToReuse: false });
  });
  it("marks absent processes interrupted and safe to reuse when token inspection is complete", async () => {
    expect(await executor([]).inspect(record())).toMatchObject({ status: "interrupted", safeToReuse: true });
  });
  it("does not own reused parent or child PIDs or their unrelated descendants", async () => {
    expect(await executor([
      { pid: 42, parentPid: 1, birth: "900", token: "unrelated" },
      { pid: 43, parentPid: 42, birth: "901", token: "unrelated" },
    ]).inspect(record())).toMatchObject({ status: "interrupted", safeToReuse: true, processes: [] });
  });
  it("does not associate an old child with a reused live parent PID", async () => {
    const oldChild = { pid: 90, parentPid: 42, birth: "99" };
    expect((await executor([identity, oldChild]).inspect(record())).processes).toEqual([identity]);
  });
  it("rechecks absence to discover a child born during the first snapshot", async () => {
    const child = { pid: 90, parentPid: 1, birth: "120", token: "owned" };
    let reads = 0;
    const process = new NodeProcessExecutor(undefined, async () => ({ host: os.hostname(), bootId: "boot",
      tokensComplete: true, diagnostics: [], processes: ++reads === 1 ? [] : [child] }));
    expect(await process.inspect(record())).toMatchObject({ status: "active", safeToReuse: false, processes: [child] });
  });
  it("keeps uncertainty for Windows descendants that could outlive an unobserved parent", async () => {
    expect(await executor([], false).inspect(record({ platform: "win32", status: "exited" }))).toMatchObject({
      status: "unknown", safeToReuse: false, diagnostics: [expect.stringContaining("surviving descendants")],
    });
  });
  it("permits reuse after a host restart even when Windows token inspection is unavailable", async () => {
    expect(await executor([], false, "new-boot").inspect(record())).toMatchObject({ status: "interrupted", safeToReuse: true });
  });
  it("preserves inspection failures as actionable diagnostics", async () => {
    const process = new NodeProcessExecutor(undefined, async () => { throw new Error("CIM access denied"); });
    expect(await process.inspect(record())).toMatchObject({ status: "unknown", safeToReuse: false,
      diagnostics: [expect.stringContaining("CIM access denied")] });
  });
  it("never infers that a foreign-host or pre-launch record is safe", async () => {
    expect((await executor([]).inspect(record({ host: "another-host" }))).safeToReuse).toBe(false);
    expect((await executor([]).inspect(record({ status: "launching", pid: undefined }))).safeToReuse).toBe(false);
  });
});

describe("process lifecycle reporting", () => {
  it.skipIf(!["linux", "win32"].includes(process.platform))("reads OS birth evidence or preserves denied inspection diagnostics", async () => {
    let snapshot: ProcessSnapshot;
    try { snapshot = await readProcessSnapshot(); } catch (error) {
      const result = await new NodeProcessExecutor().inspect(record());
      expect(result).toMatchObject({ status: "unknown", safeToReuse: false });
      expect(result.diagnostics[0]).toContain("Process inspection failed");
      expect(String(error)).toMatch(/denied|negado|EACCES|EPERM/i);
      return;
    }
    const identity = snapshot.processes.find(p => p.pid === process.pid)!;
    expect(identity.birth).toBeTruthy();
    const owner = record({ platform: process.platform, bootId: snapshot.bootId, pid: identity.pid,
      identities: [identity], token: "fixture-token" });
    expect(await new NodeProcessExecutor().inspect(owner)).toMatchObject({ status: "active", safeToReuse: false });
  }, 15000);

  it("reports intent, launch, and actual exit to a persistable observer", async () => {
    const records: ProcessRecord[] = [];
    const process = new NodeProcessExecutor(item => records.push(item), async () => ({
      host: os.hostname(), bootId: "boot", processes: [], tokensComplete: true, diagnostics: [],
    }));
    const result = await process.spawn(globalThis.process.execPath, ["-e", "console.log('done')"], {
      cwd: globalThis.process.cwd(), intentName: "run", taskId: "T1", kind: "agent", stdio: "pipe",
    });
    expect(result).toMatchObject({ exitCode: 0, stdout: "done\n" });
    expect(records[0]).toMatchObject({ status: "launching", intentName: "run", taskId: "T1", kind: "agent" });
    expect(records.some(r => r.status === "running" && !!r.pid)).toBe(true);
    expect(records.at(-1)).toMatchObject({ status: "exited", exitCode: 0, endedAt: expect.any(String) });
    expect(new Set(records.map(r => r.token)).size).toBe(1);
  });
  it("reports preparation command launches through exec as well", async () => {
    const records: ProcessRecord[] = [];
    const process = executor([]);
    const result = await process.exec('echo prepared', { kind: "preparation", onProcessRecord: r => records.push(r) });
    expect(result.exitCode).toBe(0);
    expect(records.at(-1)).toMatchObject({ kind: "preparation", status: "exited" });
  });
  it("records spawn failures and allows absent never-launched processes to settle", async () => {
    const records: ProcessRecord[] = [];
    const process = executor([]);
    const result = await process.spawn("codeforge-command-that-does-not-exist", [], { onProcessRecord: r => records.push(r) });
    expect(result.exitCode).toBeNull();
    expect(records.at(-1)).toMatchObject({ status: "launch-failed", diagnostics: [expect.stringContaining("Process error") ] });
    expect((await process.inspect(records.at(-1)!)).safeToReuse).toBe(true);
  });
  it("does not launch when recording the launch intent fails", async () => {
    await expect(executor([]).spawn("ignored", [], { onProcessRecord: () => { throw new Error("disk full"); } }))
      .rejects.toThrow("disk full");
  });
  it("surfaces a persistence failure after launch without reporting success", async () => {
    const result = await executor([]).spawn(globalThis.process.execPath, ["-e", ""], {
      onProcessRecord: r => { if (r.status === "running") throw new Error("disk full"); },
    });
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("ownership persistence failed");
  });
  it("timeout does not claim that a parent or its descendants terminated", async () => {
    const records: ProcessRecord[] = [];
    const result = await executor([]).spawn(globalThis.process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      timeout: 30, onProcessRecord: r => records.push(r),
    });
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("timed out");
    expect(result.process?.status).toBe("running");
  });
});
