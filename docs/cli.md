# CLI Reference

CodeForge provides a powerful, deterministic command-line interface. Most commands support interactive prompts when arguments are omitted, or can be run completely non-interactively in automated pipelines and CI/CD.

---

## Global Options

```bash
codeforge [command] [options]
```

| Option | Shorthand | Description |
| :--- | :--- | :--- |
| `--version` | `-V` | Output CodeForge version |
| `--help` | `-h` | Display help for command |
| `--inline` | `-i` | Run interactive TUI directly in current terminal instead of spawning an external window |

---

## Command Groups

- [Interactive Terminal Menu](#interactive-terminal-menu)
- [Workspace & Configuration](#workspace--configuration)
  - [`codeforge init`](#codeforge-init)
  - [`codeforge config`](#codeforge-config)
- [Intent Management](#intent-management)
  - [`codeforge intent create`](#codeforge-intent-create)
  - [`codeforge intent pull`](#codeforge-intent-pull)
  - [`codeforge intent list`](#codeforge-intent-list)
  - [`codeforge intent delete`](#codeforge-intent-delete)
- [Planning](#planning)
  - [`codeforge plan generate`](#codeforge-plan-generate)
  - [`codeforge plan validate`](#codeforge-plan-validate)
- [Execution & Monitoring](#execution--monitoring)
  - [`codeforge run`](#codeforge-run)
  - [`codeforge status`](#codeforge-status)
- [Task Management](#task-management)
  - [`codeforge task info`](#codeforge-task-info)
  - [`codeforge task complete`](#codeforge-task-complete)
  - [`codeforge task retry`](#codeforge-task-retry)
  - [`codeforge task reset`](#codeforge-task-reset)
  - [`codeforge task delete`](#codeforge-task-delete)
- [Documentation](#documentation)
  - [`codeforge docs create`](#codeforge-docs-create)
  - [`codeforge docs update`](#codeforge-docs-update)
  - [`codeforge docs delete`](#codeforge-docs-delete)

---

## Interactive Terminal Menu

Running `codeforge` without arguments (or with `--inline` / `-i`) opens the full-screen interactive Terminal User Interface (TUI).

```bash
# Launch interactive TUI in an external window (default)
codeforge

# Launch interactive TUI in the current terminal window
codeforge --inline
# or
codeforge -i
```

See [TUI Guide](tui.md) for details on navigating screens, hotkeys, and the onboarding wizard.

---

## Workspace & Configuration

### `codeforge init`

Initializes CodeForge in the current repository. Creates the `.codeforge` workspace structure, rule templates, detects installed AI coding CLIs, and sets up `.codeforge/config.yaml`.

```bash
codeforge init
```

- **Arguments**: None.
- **Actions performed**:
  - Scans environment for installed coding agents (`claude`, `codex`, `antigravity`/`agy`, `cursor`).
  - Prompts to install missing CLI agents if desired.
  - Prompts for system language (`en`, `pt`, `es`).
  - Prompts for active environment, planner agent model, and executor agent model.
  - Generates `.codeforge/metadata.json`, `.codeforge/config.yaml`, and baseline project rules under `.codeforge/rules/`.

### `codeforge config`

Interactively configures preferences in `.codeforge/config.yaml`.

```bash
codeforge config
```

- **Arguments**: None.
- **Configurable fields**:
  - Environment provider (`antigravity`, `claude`, `codex`, `cursor`)
  - Planner agent & Executor agent
  - System language (`en`, `pt`, `es`)
  - External terminal launch preference
  - AI Review settings
  - Lifecycle hooks by event (add, edit, and delete commands; choose `notify` or `gate`)
  - Remote Intent Source (`linear`, `github`, `clickup`, `filesystem`)

Select `hooks` to manage commands for each lifecycle event. Select `intentSource` to set the provider, project, team, and API key or environment variable reference. Changes are saved to `.codeforge/config.yaml`.

See [Configuration Guide](configuration.md) for file schema details.

---

## Intent Management

Intents describe the feature, defect, or enhancement to build. They are stored locally as Markdown files in `.codeforge/intents/<name>.md`.

### `codeforge intent create`

Creates a new feature intent template locally.

```bash
codeforge intent create [name]
```

- **Arguments**:
  - `[name]`: *(Optional)* Kebab-case name for the intent (e.g. `user-auth`). If omitted, prompts interactively.
- **Example**:
  ```bash
  codeforge intent create user-authentication
  ```

### `codeforge intent pull`

Pulls a feature intent, user story, or issue from an external issue tracker (Linear, GitHub Issues, ClickUp) and materializes it locally as a standard Markdown intent.

```bash
codeforge intent pull [id] [options]
```

- **Arguments**:
  - `[id]`: *(Optional)* Remote issue identifier or URL (e.g. `ENG-123`, `42`, or `https://github.com/org/repo/issues/42`). Prompts with open issues if omitted.
- **Options**:
  - `-s, --source <provider>`: Overrides the provider configured in `config.yaml` (`filesystem`, `linear`, `github`, `clickup`).
  - `-n, --name <slug>`: Custom filename for local markdown file.
- **Examples**:
  ```bash
  codeforge intent pull ENG-123
  codeforge intent pull 42 --source github --name fix-token-refresh
  ```

See [Intent Sources Guide](intent-sources.md) for remote setup.

### `codeforge intent list`

Lists all feature intents in `.codeforge/intents/` along with task counts and execution state.

```bash
codeforge intent list
```

- **Arguments**: None.

### `codeforge intent delete`

Deletes an eligible intent and its associated tasks, execution records, and linked documentation. Intents with execution/Git recovery evidence are protected. `--force` skips confirmation but does not bypass protection or delete retained Git artifacts.

```bash
codeforge intent delete [name] [options]
```

- **Arguments**:
  - `[name]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
- **Options**:
  - `-f, --force`: Bypass confirmation prompt.
- **Example**:
  ```bash
  codeforge intent delete user-authentication --force
  ```

---

## Planning

### `codeforge plan generate`

Invokes the configured planner AI agent to decompose an intent into an atomic task DAG under `.codeforge/tasks/<intent>/TASK-XXX.json`. Automatically validates the generated graph and re-prompts the AI for self-healing if validation fails.

```bash
codeforge plan generate [intent]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent to plan. Prompts interactively if omitted.
- **Example**:
  ```bash
  codeforge plan generate user-authentication
  ```

### `codeforge plan validate`

Deterministically validates generated tasks against schema specifications, ID formatting, valid dependency references, and circular dependency constraints without calling an AI model.

```bash
codeforge plan validate [intent] [taskId]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
  - `[taskId]`: *(Optional)* Target single task ID (e.g. `TASK-001`). If omitted, validates the entire graph.
- **Example**:
  ```bash
  codeforge plan validate user-authentication
  ```

---

## Execution & Monitoring

### `codeforge run`

Starts or resumes autonomous execution of an intent's task graph. Each ready task uses a separate Git worktree and an explicit agent working directory. Approved commits are integrated serially before dependent tasks, review, or delivery to the original checkout.

```bash
codeforge run [intent] [options]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
- **Options**:
  - `--review`: Force the post-execution AI review phase even if disabled in config.
  - `--skip-review`: Skip the AI review phase for this run.
- **Exit codes**:
  - `0`: Execution completed and the accepted result was delivered to the original checkout.
  - `1`: Delivery did not complete, including paused/blocked recovery, pending reviewer follow-up tasks, failures, and deadlocks.
- **Examples**:
  ```bash
  codeforge run user-authentication
  codeforge run user-authentication --skip-review
  ```

### Execution Lifecycle and Recovery

**Starting prerequisites:** Git must be available; the original checkout must be on a named branch with a HEAD commit and no staged, unstaged, or nonignored untracked changes. Commit or stash local changes first. Preparation runs `npm ci` in every integration and task worktree: npm and committed package/lock files must be usable in a fresh checkout. Installation failure is recorded before the task agent or task hooks launch.

**Artifact identity:** Branches use `codex/<runId>-<taskId|integration>-<uniqueId>` regardless of the selected agent. Worktrees live under `<Git common directory>/codeforge-worktrees/<token>`, normally inside `.git/`. Exact paths and operations are recorded in `.codeforge/executions/<intent>.json`. Intents, task definitions, rules, and prompts remain in the original checkout's central `.codeforge/`; prompts distinguish this orchestration root from the execution worktree.

| Outcome | Meaning |
| :--- | :--- |
| Task approved (`status: completed`) | Verification passed and `resultCommit` identifies the committed result, including the existing HEAD for a no-change task. |
| Task integrated | That result was accepted into the integration branch with a recorded `acceptedCommit`. Dependents may now start from accepted history. |
| Delivery pending | The accepted result is retained, but the original checkout has not received it. Every task can be integrated while the run is paused. |
| Delivered | The guarded original-branch update succeeded and `deliveredCommit` matches the accepted result. Cleanup is separate. |

**Retry versus restart:** Use `codeforge task retry <intent>` for failed tasks needing another agent attempt. Their worktree, base, edits, existing commits, and diagnostics are preserved. Retry does not rerun an already committed/integrated result; use `codeforge run <intent>` to resume its integration/delivery. Restart reconciliation compares recorded operations with Git and inspects previous processes, including surviving descendants. Matching evidence allows recovery of a commit, integration, or delivery interrupted before its state save without duplicating the Git operation.

**Conflicts:** Integration is serialized in its dedicated worktree. Conflicts invoke the resolver there, followed by existing `task.verify` hooks there. At most two automatic attempts are allowed per conflict record; an interrupted attempt consumes its reserved attempt. Exhaustion retains conflict files, diagnostics, incoming commits, and the last accepted commit while blocking dependents, review, and delivery. Inspect the reported integration path. Restarting does not reset the budget or discard conflicts.

**Guarded delivery:** The integration checkout must match the complete accepted result. The original checkout must still be clean on its recorded branch and starting commit. User edits, untracked files, new commits, or a branch switch leave delivery pending. Preserve user work and reconcile the checkout with the recorded identity before running the same intent again. CodeForge does not overwrite those changes; accepted results remain on the reported integration branch.

**Cleanup:** After successful delivery, only owned, unchanged, clean worktrees with commits included in delivered history and resolved inactive process occupancy can be removed. Dirty, conflicted, occupied, redirected, or mismatched artifacts remain with diagnostics; other eligible worktrees can still be removed. Branch refs and execution records are retained. Cleanup failure does not undo delivery. Run the same intent again to retry cleanup after resolving the reported condition; there is no separate cleanup command.

```bash
codeforge status user-authentication --once
codeforge task info user-authentication TASK-002
# Failed agent or task gate; preserves the task worktree
codeforge task retry user-authentication
# Interrupted operations, pending integration/delivery, or cleanup
codeforge run user-authentication
```

| Blocked condition | Action |
| :--- | :--- |
| Missing Git/HEAD, detached branch, or dirty starting checkout | Prepare a named committed branch and preserve local changes before starting. |
| `npm ci` failed | Inspect preparation diagnostics and package/lock files in the reported worktree; retry after fixing the cause. |
| Active or unresolved process ownership | Inspect the recorded host, PID, command, launch status, and descendants. Resolve previous processes before reuse; restarting the TUI alone does not prove they exited. |
| Git identity, operation evidence, or lock is ambiguous | Inspect recorded branches, commits, paths, and diagnostics; preserve artifacts until the discrepancy is understood. |
| Legacy execution requires Git ownership evidence | Old completion flags do not establish commits or integration. Automatic migration/resumption of that record is unavailable; retain it and inspect its work separately. |
| Review produced follow-up tasks | Inspect/validate the central task files and run the same intent again. |

See [process ownership](process-ownership.md) for inspection details. Isolation is filesystem-only: ignored `.env` files are not copied, and external ports, databases, and services remain shared. Ordinary integration and delivery add no common verification gates. Individually approved results do not prove semantic correctness of combined changes.

### `codeforge status`

Displays task progress, approval/result commits, integration acceptance, branch/worktree paths, stages, process ownership, conflict attempts, delivery state, and cleanup diagnostics. Approval does not imply integration; all tasks integrated does not imply delivery.

```bash
codeforge status [intent] [options]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
- **Options**:
  - `--once`: Prints a single snapshot of the status and exits immediately.
- **Examples**:
  ```bash
  # Live status view
  codeforge status user-authentication

  # Static snapshot (useful in CI scripts)
  codeforge status user-authentication --once
  ```

---

## Task Management

### `codeforge task info`

Displays full details for a task, including title, objective, context, implementation instructions, files, dependencies, constraints, and acceptance criteria.

```bash
codeforge task info [intent] [taskId]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent.
  - `[taskId]`: *(Optional)* ID of the task (e.g. `TASK-001`).
- **Example**:
  ```bash
  codeforge task info user-authentication TASK-001
  ```

### `codeforge task complete`

Records completion only when the task already has a recorded result commit and successful integration of that same result, all dependencies are integrated, and task process ownership is inactive/resolved. It cannot bypass verification, commit, integration, or active execution. Blocked completion exits with code `1`. Resume the existing run to finish outstanding operations; manual completion does not deliver the intent.

```bash
codeforge task complete [intent-name] [task-id]
```

- **Arguments**:
  - `[intent-name]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
  - `[task-id]`: *(Optional)* Task ID. Prompts interactively if omitted.
- **Example**:
  ```bash
  codeforge task complete user-authentication TASK-002
  ```

### `codeforge task retry`

Resets eligible failed tasks to `pending`, preserves their worktree and diagnostics for the next prompt, and resumes execution. Already pending tasks also run. Retry is blocked for active/unresolved ownership or committed/integrated results requiring recovery instead of another agent attempt. The command shows counts and the same live progress display as `codeforge run`.

```bash
codeforge task retry [intent]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
- **Example**:
  ```bash
  codeforge task retry user-authentication
  ```

### `codeforge task reset`

Resets eligible tasks to `pending` without immediately triggering execution. Tasks with execution/Git recovery evidence or consumed dependencies are protected. Reset cannot discard an existing worktree result; use retry/resume or a follow-up task as appropriate.

```bash
codeforge task reset [intent] [taskId]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent.
  - `[taskId]`: *(Optional)* Specific task ID. If omitted, prompts to reset one or all tasks.
- **Example**:
  ```bash
  codeforge task reset user-authentication TASK-003
  ```

### `codeforge task delete`

Deletes an eligible definition from `.codeforge/tasks/<intent>/<taskId>.json`. Tasks with execution/Git recovery evidence or consumed results are protected. `--force` skips confirmation, not these protections; it does not remove Git branches or worktrees.

```bash
codeforge task delete [intent] [taskId] [options]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent.
  - `[taskId]`: *(Optional)* Specific task ID.
- **Options**:
  - `-f, --force`: Bypass confirmation prompt.
- **Example**:
  ```bash
  codeforge task delete user-authentication TASK-004 --force
  ```

---

## Documentation

### `codeforge docs create`

Autonomously creates technical documentation for a completed intent using the documentation agent. Analyzes the intent and code diffs, saves `.codeforge/docs/<doc-name>.md`, and updates `.codeforge/docs/manifest.json`.

```bash
codeforge docs create [doc-name] [options]
```

- **Arguments**:
  - `[doc-name]`: *(Optional)* Document name.
- **Options**:
  - `--intent <intent>`: Completed intent associated with this documentation.
- **Example**:
  ```bash
  codeforge docs create auth-architecture --intent user-authentication
  ```

### `codeforge docs update`

Incrementally updates documentation. Evaluates Git diffs against file scopes registered in `manifest.json` and prompts to update affected documents, or targets a specific document directly.

```bash
codeforge docs update [intent] [options]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent.
- **Options**:
  - `--doc <name>`: Manually target a specific document to update.
- **Example**:
  ```bash
  codeforge docs update user-authentication --doc auth-architecture
  ```

### `codeforge docs delete`

Deletes a document from `.codeforge/docs/<name>.md` and removes its entry from `manifest.json`.

```bash
codeforge docs delete [name] [options]
```

- **Arguments**:
  - `[name]`: *(Optional)* Name of the document to delete.
- **Options**:
  - `-f, --force`: Bypass confirmation prompt.
- **Example**:
  ```bash
  codeforge docs delete auth-architecture --force
  ```
