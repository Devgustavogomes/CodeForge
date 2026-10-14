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
- **Browse Intents**: View local intents, their total task count, and execution status, including `pending`, `running`, `reviewing`, `paused`, `failed`, and `completed`.
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
  - `c`: Record manual completion only for an already committed/integrated result with integrated dependencies and resolved task ownership.
  - `x`: Reset an eligible task to pending; execution/Git evidence and consumed dependencies block reset.
  - `d`: Delete an eligible definition; tasks with recovery evidence or consumed results are protected.

### 3. Run Dashboard (`3`)
Real-time execution dashboard for autonomous runs:
- **Real-Time Log Stream**: Displays output from the AI agent process as it executes tasks, with live syntax highlighting and ANSI sanitization.
- **Progress & Metrics**:
  - Dynamic progress bar showing percent complete.
  - Elapsed run timer and per-task duration tracking.
  - Metrics distinguish approved task results from integrated results; inspect delivery separately from task counts.
- **Hooks Panel**: Displays the currently running lifecycle hook and recent execution history (linters, test suites, notifications).
- **AI Review Controls**:
  - Automatically triggers after all task results are integrated (if configured).
  - `v` requests review from the task panel only when all tasks are integrated and the dashboard is neither running nor reviewing.
  - Live review logs and verdict indicators.

### Reading Execution Outcomes

Task rows/details distinguish `APPROVED` (a completed task) from `INTEGRATED` (its recorded result accepted into integration history). Details show approval/result commits, integration acceptance, branch/worktree paths, stages, owner PID/host, conflict attempts, and diagnostics. The run summary separately shows delivery, retained integration artifacts, recovery/process issues, and cleanup outcomes. A full task progress bar alone does not mean the original checkout received the result.

With the task panel focused, `Enter` or `Space` starts/resumes a run when it is neither running nor reviewing. `r` retries a selected failed task and `R` retries failed tasks; retry preserves worktrees, edits, commits, and diagnostics and can be blocked by process ownership or an already committed result. For pending integration or delivery, resume the run instead of rerunning the agent. `c`, `x`, and `X` cannot bypass completion/reset protections; blocked actions show feedback.

After restarting CodeForge, recovery inspects recorded Git operations and previous processes before reuse. A surviving child process or unknown occupancy leaves the run blocked; inspect the host/PID and diagnostics. Conflict resolution allows two automatic attempts in the integration worktree, each checked by `task.verify`; exhaustion retains files and blocks dependents. A changed original checkout leaves delivery pending and retains accepted results on the displayed integration branch.

Cleanup follows successful delivery. Owned worktrees are removed only with matching identity, clean files, delivered commits, and inactive/resolved occupancy. Ineligible worktrees remain with diagnostics, and branch refs remain available. Resolve the reported issue and resume the same intent to retry eligible cleanup. See [CLI recovery guidance](cli.md#execution-lifecycle-and-recovery).

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
