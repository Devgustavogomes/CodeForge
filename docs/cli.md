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
  - Remote Intent Source (`linear`, `github`, `clickup`, `filesystem`)

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

Deletes an intent and cleans up its associated tasks (`.codeforge/tasks/<name>`), execution records (`.codeforge/executions/<name>.json`), and linked documentation.

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

Starts or resumes autonomous execution of an intent's task graph. Spawns the executor agent in isolated child processes for each ready task in the DAG.

```bash
codeforge run [intent] [options]
```

- **Arguments**:
  - `[intent]`: *(Optional)* Name of the intent. Prompts interactively if omitted.
- **Options**:
  - `--review`: Force the post-execution AI review phase even if disabled in config.
  - `--skip-review`: Skip the AI review phase for this run.
- **Exit codes**:
  - `0`: Execution completed or paused normally.
  - `1`: Execution failed with errors or unrecoverable deadlock.
- **Examples**:
  ```bash
  codeforge run user-authentication
  codeforge run user-authentication --skip-review
  ```

### `codeforge status`

Displays the execution progress and state of all tasks for an intent.

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

Manually marks a specific task as `completed` in the execution state. Useful for bypassing tasks resolved manually or unblocking execution.

```bash
codeforge task complete <intent> <taskId>
```

- **Arguments**:
  - `<intent>`: Name of the intent.
  - `<taskId>`: ID of the task to mark completed.
- **Example**:
  ```bash
  codeforge task complete user-authentication TASK-002
  ```

### `codeforge task retry`

Resets failed tasks back to `pending`, injects captured error output and diagnostics from the failure into the prompt, and automatically resumes execution.

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

Resets tasks back to `pending` without immediately triggering execution.

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

Deletes a specific task definition file from `.codeforge/tasks/<intent>/<taskId>.json`.

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
