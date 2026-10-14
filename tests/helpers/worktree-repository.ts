import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { Task } from "../../src/domain/task.js";
import { HookContext, HookResult } from "../../src/domain/hook.js";
import { TaskContext } from "../../src/runners/AgentRunner.js";
import { NodeGitGateway } from "../../src/infrastructure/git/NodeGitGateway.js";
import { NodeWorkspaceGateway } from "../../src/infrastructure/workspace.js";
import { NodeProcessExecutor } from "../../src/infrastructure/process/NodeProcessExecutor.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { WorktreeLifecycle } from "../../src/infrastructure/worktrees/WorktreeLifecycle.js";
import { TaskScheduler } from "../../src/scheduler/TaskScheduler.js";
import { TaskSchedulerDependencies } from "../../src/scheduler/types.js";
import { PromptService } from "../../src/application/services/PromptService.js";
import { FakeProcessExecutor } from "./fake-process-executor.js";
import { ExecutionRecoveryCoordinator } from "../../src/scheduler/ExecutionRecoveryCoordinator.js";
import { CommandHookDispatcher } from "../../src/infrastructure/hooks/CommandHookDispatcher.js";

/** Explicit rendezvous: no sleeps or timing assumptions at orchestration boundaries. */
export function barrier() {
  let release!: () => void;
  const reached = new Promise<void>(resolve => { release = resolve; });
  return { reached, release };
}

/** All mutable Git artifacts live below this disposable root, including paths with spaces. */
export class WorktreeRepository {
  readonly directory = mkdtempSync(path.join(os.tmpdir(), "codeforge workflow "));
  readonly intent = "workflow";
  readonly git = new NodeGitGateway(this.directory);
  readonly gw = new NodeWorkspaceGateway(this.directory);
  readonly repo = new ExecutionStateRepository(this.gw);
  readonly processes = new NodeProcessExecutor();
  readonly inventory = new FakeProcessExecutor();
  readonly lifecycle = new WorktreeLifecycle(this.git, this.processes, this.repo);
  readonly prompt = new PromptService(this.gw);
  readonly agents: TaskContext[] = [];
  readonly events: HookContext[] = [];
  agent: (context: TaskContext) => Promise<void> = async context => {
    this.write(context.cwd, context.taskId + ".txt", "accepted\n");
  };
  gate: (context: HookContext) => Promise<HookResult[]> = async () => [
    { name: "controlled gate", type: "gate", ok: true, exitCode: 0, output: "" },
  ];
  readonly runner = { execute: vi.fn(async (context: TaskContext) => {
    this.agents.push(context);
    await this.agent(context);
  }) };
  readonly hooks = { dispatch: vi.fn(async (context: HookContext) => {
    this.events.push(context);
    return context.event === "task.verify" ? this.gate(context) : [];
  }) };
  // Preparation and Git are real. Process inventory is an explicit controllable boundary:
  // Windows CIM enumeration is not available in every test sandbox.
  readonly occupancy = vi.spyOn(this.repo, "inspectEnvironment").mockResolvedValue({
    status: "interrupted", safeToReuse: true, processes: [], diagnostics: [],
  });

  constructor(tasks: Task[]) {
    this.command(this.directory, "init", "-b", "main");
    this.command(this.directory, "config", "user.name", "Workflow Test");
    this.command(this.directory, "config", "user.email", "workflow@example.com");
    this.command(this.directory, "config", "commit.gpgsign", "false");
    this.command(this.directory, "config", "core.hooksPath", path.join(this.directory, ".git", "fixture-hooks"));
    this.command(this.directory, "config", "core.autocrlf", "false");
    this.write(this.directory, ".gitignore", ".codeforge/\nnode_modules/\n.npm-cache/\n.env\n");
    this.write(this.directory, ".npmrc", "offline=true\naudit=false\nfund=false\ninstall-links=true\ncache=.npm-cache\n");
    const name = "workflow-fixture";
    this.write(this.directory, "deps/local/package.json", JSON.stringify({ name: "local", version: "1.0.0" }));
    this.write(this.directory, "deps/local/hook.cjs", [
      'const assert = require("node:assert/strict");',
      'const context = JSON.parse(require("node:fs").readFileSync(0, "utf8"));',
      'assert.equal(process.cwd(), context.cwd);',
      'assert.equal(process.env.CODEFORGE_CWD, context.cwd);',
      'assert.equal(process.env.CODEFORGE_EVENT, "task.verify");',
      'assert.equal(process.env.CODEFORGE_TASK_ID, context.taskId);',
    ].join("\n"));
    this.write(this.directory, "package.json", JSON.stringify({ name, version: "1.0.0", type: "module", dependencies: { local: "file:deps/local" } }));
    this.write(this.directory, "package-lock.json", JSON.stringify({ name, version: "1.0.0", lockfileVersion: 3, packages: {
      "": { name, version: "1.0.0", dependencies: { local: "file:deps/local" } },
      "node_modules/local": { version: "1.0.0", resolved: "file:deps/local" },
    } }));
    this.write(this.directory, "shared.txt", "base\n");
    this.write(this.directory, "eslint.config.js", 'export default [{ files: ["**/*.js"], rules: { "no-undef": "error" } }];\n');
    this.command(this.directory, "add", ".");
    this.command(this.directory, "commit", "-m", "fixture base");
    this.write(this.directory, ".codeforge/metadata.json", "{}");
    for (const task of tasks) this.addTask(task);
  }

  addTask(task: Task) {
    this.gw.mkdir(".codeforge/tasks/" + this.intent);
    this.gw.writeFile(".codeforge/tasks/" + this.intent + "/" + task.id + ".json", JSON.stringify(task));
  }
  command(cwd: string, ...args: string[]) {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  }
  write(cwd: string, file: string, content: string) {
    const target = path.join(cwd, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  read(cwd: string, file: string) { return readFileSync(path.isAbsolute(file) ? file : path.join(cwd, file), "utf8"); }
  state() { return this.repo.load(this.intent)!; }
  scheduler(overrides: Partial<TaskSchedulerDependencies> = {}) {
    return new TaskScheduler({ cwd: this.directory, gw: this.gw, stateRepo: this.repo,
      promptService: this.prompt, runner: this.runner, hooks: this.hooks,
      worktreeLifecycle: this.lifecycle,
      recoveryCoordinator: new ExecutionRecoveryCoordinator(this.repo, this.git, this.inventory),
      config: { environment: "test", plannerAgent: "controlled", executorAgent: "controlled", language: "en" },
      ...overrides });
  }
  keepWorktrees = { cleanup: async () => ({ failures: [] }) };
  verifyCalls() { return this.events.filter(context => context.event === "task.verify"); }
  useESLint() {
    const eslint = path.resolve("node_modules/eslint/bin/eslint.js");
    const dispatcher = new CommandHookDispatcher({ "task.verify": [{ name: "eslint", type: "gate",
      run: 'node deps/local/hook.cjs && node "' + eslint + '" .', timeout: 30000 }] });
    this.gate = context => dispatcher.dispatch(context);
  }
  dispose() {
    this.occupancy.mockRestore();
    if (path.dirname(this.directory) !== os.tmpdir() || !path.basename(this.directory).startsWith("codeforge workflow ")) {
      throw new Error("Refusing to remove a directory outside the disposable fixture root.");
    }
    rmSync(this.directory, { recursive: true, force: true });
  }
}
