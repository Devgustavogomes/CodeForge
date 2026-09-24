# Terminal User Interface (TUI)

CodeForge features a full-screen, reactive Terminal User Interface (TUI) built with **Ink** and **React**. It transforms AI-assisted development into an interactive control center for managing intents, inspecting task DAGs, streaming execution logs in real time, configuring lifecycle hooks, and generating documentation.

---

## Launching the TUI

To open the TUI, simply run `codeforge` without arguments:

```bash
codeforge
```

### External Terminal vs Inline Mode

By default, CodeForge detects your operating system and launches the TUI in an **external, dedicated terminal window** (e.g. Windows Terminal, iTerm2, Kitty, Alacritty, GNOME Terminal). This ensures full color fidelity, alternate screen buffer support, and prevents layout collisions with embedded IDE terminals.

To run the TUI directly within your current terminal session:

```bash
codeforge --inline
# or
codeforge -i
```

You can also make inline mode permanent by configuring `externalTerminal: false` in `.codeforge/config.yaml`.

---

## Onboarding Wizard

When you launch `codeforge` in a directory that has not yet been initialized, CodeForge automatically welcomes you with the **Onboarding Wizard**:

1. **CLI Detection & Installation**: Checks for installed AI coding CLIs (`antigravity`/`agy`, `claude`, `codex`, `cursor`) and offers automated installation if missing.
2. **Environment & Agent Selection**: Lets you pick your preferred active environment, planner agent, and executor agent.
3. **Language Selection**: Choose interface and prompt language (`English`, `Português`, `Español`).
4. **Pipeline Overview**: Explains the flow (Intent → Plan DAG → Isolated Execution → Hooks → AI Review → Docs).

---

## Screen Navigation

The TUI is organized into 5 primary screens accessible via `Tab` / `Shift+Tab` or numerical shortcuts `1`–`5`:

```text
[1] Intents   [2] Tasks   [3] Run Dashboard   [4] Docs   [5] Config
```

### 1. Intents Screen (`1`)
Manage and monitor all feature intents:
- **Browse Intents**: View local intents, their total task count, and execution status (`completed`, `in_progress`, `failed`, `pending`).
- **Create Intent (`c`)**: Opens the creation modal to scaffold a new local intent markdown file.
- **Pull Remote Intent (`p`)**: Opens the remote pull modal to query configured external issue trackers (Linear, GitHub, ClickUp) or paste an issue ID/URL.
- **Generate Plan (`g`)**: Triggers the planner agent in the background to decompose the selected intent into a task DAG.
- **Run Intent (`r`)**: Immediately switches to the Run Dashboard and begins executing the selected intent.
- **Delete Intent (`d`)**: Opens a confirmation modal to safely delete an intent, its tasks, and execution history.

### 2. Tasks Screen (`2`)
Inspect and interact with the Directed Acyclic Graph (DAG) of tasks:
- **Search & Filter (`/`)**: Search tasks by ID or title.
- **Task Tree / DAG Viewer**: Displays tasks with status icons, dependencies, and execution progress.
- **Task Inspector (`Enter`)**: Opens `ViewTaskModal` showing full task metadata:
  - Objective & Context
  - Implementation steps
  - Dependencies & Target files
  - Constraints & Acceptance criteria
- **Task Actions**:
  - `c`: Manually mark the selected task as completed.
  - `x`: Reset the selected task (or all tasks) back to pending.
  - `d`: Delete the task JSON definition.

### 3. Run Dashboard (`3`)
Real-time execution dashboard for autonomous runs:
- **Real-Time Log Stream**: Displays output from the AI agent process as it executes tasks, with live syntax highlighting and ANSI sanitization.
- **Progress & Metrics**:
  - Dynamic progress bar showing percent complete.
  - Elapsed run timer and per-task duration tracking.
  - Metrics breakdown: Completed, In Progress, Pending, Failed.
- **Hooks Panel**: Displays the currently running lifecycle hook and recent execution history (linters, test suites, notifications).
- **AI Review Controls**:
  - Automatically triggers when all tasks succeed (if configured).
  - Can be manually triggered via `v` to run a post-implementation review.
  - Live review logs and verdict indicators.

### 4. Docs Screen (`4`)
Manage technical documentation generated from intents:
- **Document List**: Lists all markdown documents tracked in `.codeforge/docs/manifest.json`.
- **View Document (`Enter`)**: Opens the markdown document viewer modal with smooth scroll controls.
- **Create Doc (`c`)**: Generates technical documentation for a completed intent using the documentation agent.
- **Update Doc (`u`)**: Analyzes Git diffs against document scopes to refresh documentation.
- **Delete Doc (`d`)**: Deletes document and cleans up manifest tracking.

### 5. Config Screen (`5`)
Interactive preferences and lifecycle management:
- **Language**: Instantly cycle system language between `en`, `pt`, and `es`.
- **Environment & Models**: Select active provider (`antigravity`, `claude`, `codex`, `cursor`) and adjust planner/executor models.
- **Lifecycle Hooks (`Enter` on Hooks)**: Opens `ConfigureHooksModal`, allowing you to add, edit, reorder, or delete `task.verify`, `run.completed`, and other lifecycle hooks with gate/notify classification.
- **Intent Sources**: Configure external provider credentials, API key environment variables, and project filters.
- **AI Review**: Toggle autonomous review on/off.

---

## Global Hotkeys

| Key | Action |
| :--- | :--- |
| `1` – `5` | Jump directly to tab (Intents, Tasks, Run, Docs, Config) |
| `Tab` / `Shift+Tab` | Cycle through tabs |
| `↑` / `↓` / `j` / `k` | Navigate lists and items |
| `Enter` | Select item / Open detail modal |
| `Esc` | Close modal / Go back |
| `q` / `Ctrl+C` | Quit CodeForge TUI |
| `?` | Toggle hotkey help footer |
