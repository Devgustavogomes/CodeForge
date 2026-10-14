import path from "node:path";
import { ProcessExecutor, ProcessInspection, ProcessRecord } from "../process/ProcessExecutor.js";
import { randomUUID } from "node:crypto";
import { ExecutionOperation, IntentExecutionState, TaskExecutionState } from "../../domain/execution.js";
import { Task } from "../../domain/task.js";
import { WorkspaceGateway } from "../workspace.js";
import { PATHS } from "../paths.js";

export class ExecutionStateConflictError extends Error {
  constructor(intentId: string) {
    super(`Execution state changed for ${intentId}; reload and apply the transition again.`);
  }
}

export class ExecutionStateRepository {
  /** Always inject the orchestration checkout gateway, not a task worktree gateway. */
  private gw: WorkspaceGateway;

  constructor(gw: WorkspaceGateway) {
    this.gw = gw.executionWorkspace();
  }

  private validateId(intentName: string): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(intentName)) {
      throw new Error("Invalid execution intent identifier");
    }
  }

  load(intentName: string): IntentExecutionState | null {
    this.validateId(intentName);
    const statePath = PATHS.executionState(intentName);
    if (!this.gw.exists(statePath)) return null;
    const state = JSON.parse(this.gw.readFile(statePath)) as IntentExecutionState;
    if (state.schemaVersion === undefined && state.tasks === undefined) state.tasks = {};
    if (state.intentId !== intentName || !state.tasks || typeof state.tasks !== "object" ||
        Array.isArray(state.tasks)) throw new Error("Invalid execution state");
    if (state.schemaVersion !== undefined && state.schemaVersion !== 2) {
      throw new Error("Unsupported execution state schema");
    }
    if (state.schemaVersion === undefined) {
      // Preserve old records and timestamps; never infer commits or integration from completion.
      state.recovery = "legacy-evidence-required";
      state.revision = 0;
    }
    return state;
  }

  private persist(state: IntentExecutionState, previous: IntentExecutionState | null): void {
    // Deleting a task from the active plan must not delete its execution evidence.
    for (const [id, task] of Object.entries(previous?.tasks ?? {})) {
      if (!state.tasks[id]) {
        state.archivedTasks ??= {};
        (state.archivedTasks[id] ??= []).push(structuredClone(task));
      }
    }
    for (const operation of previous?.operations ?? []) {
      const next = state.operations?.find((item) => item.id === operation.id);
      if (!next) throw new Error("Execution operations cannot be discarded");
      const { status: oldStatus, outcome: oldOutcome, ...oldIntent } = operation;
      const { status: newStatus, outcome: newOutcome, ...newIntent } = next;
      if (JSON.stringify(oldIntent) !== JSON.stringify(newIntent) ||
          (oldStatus !== "intended" && (oldStatus !== newStatus ||
            JSON.stringify(oldOutcome) !== JSON.stringify(newOutcome)))) {
        throw new Error("Recorded operation evidence cannot be rewritten");
      }
    }
    for (const record of previous?.processes ?? []) {
      const next = state.processes?.find(item => item.id === record.id);
      if (!next) throw new Error("Process ownership records cannot be discarded");
      const identity = (item: ProcessRecord) => [item.id, item.token, item.host, item.platform,
        item.command, item.args, item.cwd, item.startedAt, item.intentName, item.taskId, item.kind];
      if ((["exited", "launch-failed", "interrupted"].includes(record.status) && next.status !== record.status) ||
          JSON.stringify(identity(record)) !== JSON.stringify(identity(next)) ||
          (record.pid !== undefined && next.pid !== record.pid) ||
          (record.bootId !== undefined && next.bootId !== record.bootId) ||
          JSON.stringify(next.identities.slice(0, record.identities.length)) !== JSON.stringify(record.identities) ||
          JSON.stringify(next.diagnostics.slice(0, record.diagnostics.length)) !== JSON.stringify(record.diagnostics) ||
          (record.endedAt && (next.endedAt !== record.endedAt || next.exitCode !== record.exitCode))) {
        throw new Error("Process identifying evidence cannot be rewritten");
      }
    }
    if (previous?.runId && state.runId !== previous.runId) {
      throw new Error("Existing execution identity cannot be replaced");
    }
    if (previous?.archivedTasks) {
      for (const [id, records] of Object.entries(previous.archivedTasks)) {
        if (JSON.stringify(state.archivedTasks?.[id]?.slice(0, records.length)) !== JSON.stringify(records)) {
          throw new Error("Archived execution records cannot be discarded");
        }
      }
    }
    if (state.schemaVersion === undefined) state.recovery = "legacy-evidence-required";
    state.schemaVersion = 2;
    state.revision = (previous?.revision ?? 0) + 1;
    state.updatedAt = new Date().toISOString();
    this.gw.writeFileAtomic(PATHS.executionState(state.intentId), JSON.stringify(state, null, 2));
  }

  /** Compatibility API with optimistic concurrency; stale whole-state saves fail visibly. */
  save(state: IntentExecutionState): void {
    this.validateId(state.intentId);
    this.gw.withFileLock(PATHS.executionLock(state.intentId), () => {
      const previous = this.load(state.intentId);
      if (previous && (state.revision !== previous.revision || state.runId !== previous.runId)) {
        throw new ExecutionStateConflictError(state.intentId);
      }
      const next = structuredClone(state);
      this.persist(next, previous);
      Object.assign(state, next);
    });
  }

  /** Apply a synchronous transition to the latest central state under exclusive ownership. */
  update(intentName: string, transition: (state: IntentExecutionState) => void): IntentExecutionState {
    this.validateId(intentName);
    return this.gw.withFileLock(PATHS.executionLock(intentName), () => {
      const previous = this.load(intentName);
      if (!previous) throw new Error(`Execution state not found: ${intentName}`);
      const next = structuredClone(previous);
      const result: unknown = transition(next);
      if (result instanceof Promise) throw new Error("Execution transitions must be synchronous");
      if (next.intentId !== intentName) throw new Error("Execution intent identity cannot change");
      this.persist(next, previous);
      return next;
    });
  }

  updateTask(intentName: string, taskId: string,
    transition: (task: TaskExecutionState, state: IntentExecutionState) => void): IntentExecutionState {
    return this.update(intentName, (state) => {
      const task = state.tasks[taskId];
      if (!task) throw new Error(`Task execution state not found: ${taskId}`);
      transition(task, state);
    });
  }

  recordOperationIntent(intentName: string, operation: ExecutionOperation): IntentExecutionState {
    return this.update(intentName, (state) => {
      if (!state.runId || operation.runId !== state.runId || operation.status !== "intended" ||
          operation.outcome || state.operations?.some((item) => item.id === operation.id)) {
        throw new Error("Invalid or duplicate operation intent");
      }
      (state.operations ??= []).push(structuredClone(operation));
    });
  }

  recordOperationOutcome(intentName: string, operationId: string,
    status: "succeeded" | "failed", outcome: NonNullable<ExecutionOperation["outcome"]>): IntentExecutionState {
    return this.update(intentName, (state) => {
      const operation = state.operations?.find((item) => item.id === operationId);
      if (!operation || operation.status !== "intended") throw new Error("Operation is not pending");
      operation.status = status;
      operation.outcome = structuredClone(outcome);
    });
  }

  recordProcess(intentName: string, record: ProcessRecord): IntentExecutionState {
    return this.update(intentName, state => {
      if (record.intentName !== intentName) throw new Error("Process intent differs from execution");
      const records = state.processes ??= [];
      const index = records.findIndex(item => item.id === record.id);
      if (index < 0) records.push(structuredClone(record));
      else records[index] = structuredClone(record);
    });
  }

  processReporter(intentName: string): (record: ProcessRecord) => void {
    return record => { this.recordProcess(intentName, record); };
  }

  /** Every launch remains relevant: an exited parent may leave occupied descendants. */
  async inspectEnvironment(intentName: string, executor: ProcessExecutor,
    scope: { taskId?: string; cwd?: string } = {}): Promise<ProcessInspection> {
    const state = this.load(intentName);
    if (!state) throw new Error("Execution state not found: " + intentName);
    const normalize = (cwd: string) => {
      const value = path.resolve(cwd);
      return process.platform === "win32" ? value.toLowerCase() : value;
    };
    const records = (state.processes ?? []).filter(record =>
      (scope.taskId === undefined || record.taskId === scope.taskId) &&
      (scope.cwd === undefined || normalize(record.cwd) === normalize(scope.cwd)));
    if (!records.length) return { status: "unknown", safeToReuse: false, processes: [],
      diagnostics: ["No process launch evidence exists; inspect the environment before reuse."] };
    const checks = await Promise.all(records.map(record => executor.inspect(record).catch(error => ({
      status: "unknown" as const, safeToReuse: false, processes: [],
      diagnostics: ["Process inspection failed: " + String(error)],
    }))));
    const status = checks.some(item => item.status === "active") ? "active" :
      checks.some(item => !item.safeToReuse) ? "unknown" : "interrupted";
    return { status, safeToReuse: checks.every(item => item.safeToReuse),
      processes: checks.flatMap(item => item.processes), diagnostics: checks.flatMap(item => item.diagnostics) };
  }

  /** Bounded recovery: never wait for promises owned by a previous orchestrator. */
  async reconcileProcesses(intentName: string, executor: ProcessExecutor): Promise<IntentExecutionState> {
    const snapshot = this.load(intentName);
    if (!snapshot) throw new Error("Execution state not found: " + intentName);
    const checks = await Promise.all(Object.entries(snapshot.tasks).filter(([, task]) => task.status === "running" || task.integration?.status === "running")
      .map(async ([taskId, task]) => ({ taskId, check: await this.inspectEnvironment(intentName, executor,
        task.integration?.status === "running" && snapshot.integrationWorktreePath
          ? { cwd: snapshot.integrationWorktreePath } : { taskId }) })));
    const processChecks = await Promise.all((snapshot.processes ?? []).filter(record => record.status === "running" || record.status === "launching")
      .map(async record => ({ record, check: await executor.inspect(record).catch(error => ({
        status: "unknown" as const, safeToReuse: false, processes: [], diagnostics: [String(error)],
      })) })));
    return this.update(intentName, state => {
      for (const { taskId, check } of checks) {
        const task = state.tasks[taskId];
        // Do not settle a newer attempt or newly launched work while inspecting an older snapshot.
        if (!task || task.status !== snapshot.tasks[taskId].status || task.attempt !== snapshot.tasks[taskId].attempt ||
            JSON.stringify(state.processes) !== JSON.stringify(snapshot.processes)) continue;
        if (check.status === "active") continue;
        const recordedAt = new Date().toISOString();
        const message = check.safeToReuse ? "Execution interrupted: no owned processes remain." :
          "Execution interrupted; environment occupancy is unresolved. " + check.diagnostics.join(" ");
        if (task.status === "running") { task.status = "failed"; task.completedAt = recordedAt; }
        if (task.integration?.status === "running") {
          task.integration.status = check.safeToReuse ? "failed" : "blocked";
          task.integration.completedAt = recordedAt;
        }
        (task.errors ??= []).push(message);
        (task.diagnostics ??= []).push({ stage: "recovery", message, recordedAt, attempt: task.attempt });
        (task.stages ??= {})[task.stage ?? "execution"] = {
          status: check.safeToReuse ? "failed" : "blocked", completedAt: recordedAt,
        };
      }
      for (const { record, check } of processChecks) {
        const current = state.processes?.find(item => item.id === record.id);
        if (!current || JSON.stringify(current) !== JSON.stringify(record) || !check.safeToReuse) continue;
        current.status = "interrupted";
        current.endedAt = new Date().toISOString();
        current.exitCode = null;
        current.diagnostics.push("Recovered interrupted process: no owned processes remain.");
      }
    });
  }

  init(intentName: string, tasks: Task[]): IntentExecutionState {
    this.validateId(intentName);
    if (this.load(intentName)) throw new Error("Execution already exists; resume the existing record");
    const now = new Date().toISOString();
    const state: IntentExecutionState = {
      schemaVersion: 2, revision: 0, runId: randomUUID(),
      intentId: intentName, status: "running", startedAt: now,
      tasks: {}, operations: [], delivery: { status: "pending" }, cleanup: [], updatedAt: now,
    };
    for (const task of tasks) {
      state.tasks[task.id] = {
        status: "pending", dependencies: task.dependencies || [], title: task.title,
        attempt: 0, stages: {}, integration: { status: "pending" }, diagnostics: [],
      };
    }
    return state;
  }
}
