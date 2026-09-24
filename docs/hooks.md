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

CodeForge exposes 8 granular lifecycle events:

| Event | When It Fires | Gate Capable? |
| :--- | :--- | :---: |
| `run.started` | An intent run begins | No |
| `run.completed` | All tasks in the intent have finished successfully | No |
| `run.failed` | The run terminated with at least one failed task | No |
| `run.deadlock` | Pending tasks remain but dependencies can never be resolved | No |
| `task.started` | A specific task is dispatched to the AI coding agent | No |
| `task.verify` | The agent returned, **before** the task is marked complete | **Yes** |
| `task.completed` | A task passed all verification and is officially marked done | No |
| `task.failed` | A task failed (due to agent error or gate hook veto) | No |

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
  Task Completed      Task Vetoed & Failed
        │                   │
        ▼                   ▼
  Next DAG Task     Output Captured as Diagnostics
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

1. The AI agent finishes modifying the codebase and exits.
2. CodeForge immediately runs the configured `task.verify` gate hooks in sequence (e.g., type check, linter, tests).
3. If a gate hook exits with a non-zero code, CodeForge intercepts the failure, marks the task as failed, and captures the stdout/stderr diagnostics.
4. When retried, CodeForge builds a fresh prompt for the agent containing the **exact compiler/linter error output**.
5. The agent fixes the issues without human intervention or copy-pasting error messages.

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
- `CODEFORGE_CWD`: Current workspace directory.

### 2. Standard Input (stdin)
The full context payload is piped as JSON into the hook process's `stdin`:

```json
{
  "event": "task.verify",
  "intent": "user-authentication",
  "taskId": "TASK-002",
  "timestamp": "2026-09-24T14:00:00.000Z"
}
```

### Example Hook Script

```bash
#!/usr/bin/env bash
# scripts/verify.sh

echo "Verifying $CODEFORGE_TASK_ID for intent $CODEFORGE_INTENT..."

# Run project linter and tests
npm run lint && npm test
```
