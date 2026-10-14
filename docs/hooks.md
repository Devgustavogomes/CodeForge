# Lifecycle Hooks

Hooks are CodeForge's bridge between the internal agent workflow and external tools, linters, test runners, and monitoring systems.

A hook is simply a shell command or script that CodeForge runs at specific lifecycle moments during an intent's execution. Hooks do not require TypeScript or any specific framework—any executable that adheres to standard exit codes and environment conventions can be used.

---

## Hook Types: `notify` vs `gate`

CodeForge distinguishes between two types of hooks based on how their exit codes are treated:

| Type | Exit Code Impact | Typical Use Cases |
| :--- | :--- | :--- |
| `notify` *(Default)* | Informational only. Non-zero exit codes are logged but never fail tasks or halt execution. | Slack/Discord notifications, metrics, audit logs, CI triggers. |
| `gate` | **Non-zero exit code fails the task.** Intercepts task completion and captures diagnostic output. | Linters (`npm run lint`), type checkers (`tsc`), test suites (`npm test`, `pytest`, `cargo test`), policy checks. |

> [!NOTE]
> `notify` is the default type so that an unclassified hook cannot accidentally break your build. Only `task.verify` supports `gate` hooks.

---

## Lifecycle Events

CodeForge exposes the following lifecycle events:

| Event | When It Fires | Gate Capable? |
| :--- | :--- | :---: |
| `run.started` | An intent run begins | No |
| `run.completed` | The accepted result was delivered successfully; cleanup may have separate diagnostics | No |
| `run.failed` | The run terminated with at least one failed task | No |
| `run.deadlock` | Pending tasks remain but dependencies can never be resolved | No |
| `task.started` | A prepared task worktree is ready, before agent launch | No |
| `task.verify` | The agent returned, **before** the task is marked complete | **Yes** |
| `task.completed` | Task verification passed and its result commit was recorded; integration may still be pending | No |
| `task.failed` | Execution, verification, or commit failed after the task working directory became available | No |
| `review.started` | AI review begins after task integrations settle | No |
| `review.completed` | Review approved the result or produced validated follow-up tasks | No |

---

## The Auto-Healing Gate Loop

Gate hooks on `task.verify` create an automated, deterministic verification loop:

```text
       AI Agent Implements Task
                  │
                  ▼
         Hook: task.verify
   (e.g., npm run lint && npm test)
                  │
        ┌─────────┴─────────┐
     Exit 0              Exit != 0
        │                   │
        ▼                   ▼
  Commit Result       Task Vetoed & Failed
        │                   │
        ▼                   ▼
  Integrate Result  Output Captured as Diagnostics
                            │
                            ▼
              codeforge task retry <intent>
                            │
                            ▼
               Fresh Prompt with Exact Errors
                            │
                            ▼
                   Agent Fixes Defects
```

1. The AI agent finishes modifying its task worktree and exits.
2. CodeForge immediately runs the configured `task.verify` gate hooks in sequence (e.g., type check, linter, tests).
3. If a gate hook exits with a non-zero code, CodeForge intercepts the failure, marks the task as failed, and captures the stdout/stderr diagnostics.
4. When retried, CodeForge builds a fresh prompt for the agent containing the **exact compiler/linter error output**.
5. Retry reuses the same worktree and its edits/commits. Once verification passes, CodeForge records the result commit and integrates it before releasing dependent tasks.

---

## Configuring Hooks

Hooks are declared in `.codeforge/config.yaml` under the `hooks` section, grouped by event name:

```yaml
environment: antigravity
plannerAgent: gemini-3.8-flash-high
executorAgent: gemini-3.8-flash-medium
language: en

hooks:
  task.verify:
    - name: typecheck
      run: npm run typecheck
      type: gate
      timeout: 120000        # Timeout in ms (default: 300000 = 5m)
    - name: linter
      run: npm run lint
      type: gate
    - name: unit-tests
      run: npm test
      type: gate

  run.completed:
    - name: notify-slack
      run: ./scripts/notify-team.sh
      type: notify
```

Hooks can also be interactively added, modified, or toggled directly inside the TUI via the **Config** tab (`Tab 5` → `Lifecycle Hooks`).

---

## Hook Execution Context

When CodeForge executes a hook, it provides execution context in two ways:

### 1. Environment Variables
- `CODEFORGE_EVENT`: Name of the triggering event (e.g. `task.verify`).
- `CODEFORGE_INTENT`: Name/slug of the active intent.
- `CODEFORGE_TASK_ID`: ID of the current task (e.g. `TASK-001`), if applicable.
- `CODEFORGE_CWD`: The explicit hook working directory: a task worktree for ordinary task events, the integration worktree for conflict verification, or the original orchestration checkout for run/review notification events.

### 2. Standard Input (stdin)
The full context payload is piped as JSON into the hook process's `stdin`:

```json
{
  "event": "task.verify",
  "intentName": "user-authentication",
  "taskId": "TASK-002",
  "cwd": "/projects/my-project/.git/codeforge-worktrees/<task-token>"
}
```

## Working Directories and Isolation

Hook processes use `context.cwd` as their actual working directory; stdin `cwd` and `CODEFORGE_CWD` identify that same directory. Relative commands such as `npm run lint` use the prepared worktree's files and local `node_modules`. Commit scripts and package/lock files needed by hooks: ignored files from the original checkout, including `.env`, are not copied. The central orchestration `.codeforge/` remains in the original checkout; do not assume it exists relative to a task hook's cwd.

`task.verify` is the sole ordinary task gate. Passing it records a task result before integration. Independent approved results integrate serially without a common integration gate, and final delivery does not rerun lint/build/tests. If Git conflicts occur, each of the two allowed resolver attempts uses `task.verify` in the integration worktree. That conflict check does not create an ordinary combined-result or final gate.

Worktrees isolate files and local installations; inherited environment variables, ports, databases, and external services remain shared. Configure hook commands with this boundary in mind. A task passing its gates does not guarantee semantic correctness when combined with other approved tasks.

### Example Hook Script

```bash
#!/usr/bin/env bash
# scripts/verify.sh

echo "Verifying $CODEFORGE_TASK_ID for intent $CODEFORGE_INTENT..."

# The hook already runs in the task worktree.
echo "Working directory: $CODEFORGE_CWD"
npm run lint && npm test
```
