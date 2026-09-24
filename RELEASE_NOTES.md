# v0.4.0 — Terminal UI, Remote Intent Sources, Lifecycle Hooks & AI Review

> **Turn AI coding agents into an automated, structured, and repeatable software development workflow.**

---

## ✨ New Features & Workflow Enhancements

- **Interactive Terminal User Interface (TUI)**: Introduced a full-screen, reactive terminal interface built with **Ink** and **React**. Features multi-tab navigation across Intents, Tasks, Run Dashboard, Docs, and Config screens (`codeforge`).
- **Onboarding Wizard**: Welcomes first-time users with automated CLI detection for installed agents (`claude`, `codex`, `antigravity`/`agy`, `cursor`), optional automatic CLI installation, preferred language selection, and an interactive pipeline walkthrough.
- **Cross-Platform External Terminal Launcher**: Launches the TUI in a dedicated external terminal window by default (Windows Terminal, PowerShell, iTerm2, Kitty, Alacritty, GNOME Terminal) to ensure pristine rendering and avoid collisions with IDE terminals. Supports inline execution via `codeforge --inline` (`-i`).
- **Remote Intent Sources & Local Materialization (`codeforge intent pull`)**: Ingest issues and user stories directly from **Linear**, **GitHub Issues**, and **ClickUp** (or local filesystem) via URL or issue ID. Remote items are materialized locally into `.codeforge/intents/<id>.md`, keeping the entire remaining development lifecycle 100% offline, local, and reproducible.
- **Secure Credential References (`apiKeyEnv`)**: Protects secrets by configuring environment variable references (e.g. `LINEAR_API_KEY`) instead of plain-text tokens in `.codeforge/config.yaml`.
- **Lifecycle Hooks & Auto-Healing Verification Gates**: Implemented an extensible hook dispatcher supporting 8 lifecycle events (`run.started`, `run.completed`, `run.failed`, `run.deadlock`, `task.started`, `task.verify`, `task.completed`, `task.failed`). Hook classification distinguishes between `notify` and `gate`:
  - `task.verify` gate hooks veto task completion on non-zero exit codes (linters, typecheckers, test suites).
  - Failed hook output is recorded as task diagnostics and automatically injected into the agent's fresh prompt on `codeforge task retry` for autonomous self-healing.
- **Autonomous AI Review Phase**: Post-execution review step that evaluates the cumulative Git diff against the intent's requirements and acceptance criteria before marking a run complete. Enforces **silence as approval**—zero files created indicates approval, while verified defects spawn new `TASK-XXX.json` files that seamlessly re-queue for execution. Supports `--review` and `--skip-review` CLI flags and hotkey `v` in the TUI.
- **Token Efficiency & Context Isolation**: Every task executes in a clean, isolated child process, eliminating context bloat and token degradation. System contracts are decoupled from user rules, and prompts use compact JSON schemas with streamed stdin.
- **Stage-Specific Customizable Rules**: Users can customize project guidelines under `.codeforge/rules/` for each distinct stage (`planning.md`, `running.md`, `review.md`, `docs.md`, `docs-update.md`). When empty, rules are omitted with zero token overhead.
- **Specs → Intents Terminology Migration**: Standardized all domain terminology, use cases, CLI commands (`codeforge intent create/pull/list/delete`), and paths (`.codeforge/intents/`) from "specifications" to "intents".
- **Full CRUD Command Suite**:
  - `codeforge intent list` & `codeforge intent delete [name]`: Inspect and safely cascade-delete intents, task graphs, executions, and docs.
  - `codeforge task delete [intent] [taskId]`: Delete individual task JSON files.
  - `codeforge docs delete [name]`: Delete documentation files and synchronize `manifest.json`.
- **Environment & Configuration Interpolation**: Supports root `.env` and `.codeforge/.env` files with dynamic `${VARIABLE_NAME}` interpolation inside `.codeforge/config.yaml`.
- **Comprehensive Documentation Revamp**: Modularized documentation into dedicated guides in `docs/` (`cli.md`, `tui.md`, `intent-sources.md`, `hooks.md`, `ai-review.md`, `token-efficiency.md`, `configuration.md`), updated `README.md` with explicit "What CodeForge Is / Isn't" positioning, and removed unimplemented deterministic checkers.

---

## ♻️ Refactor, Architecture & Quality

- **Composition Root Dependency Injection**: Introduced `AppContainer` (`src/infrastructure/container.ts`) providing unified dependency injection across all application use cases and CLI commands.
- **Modular TaskScheduler Architecture**: Decoupled monolithic scheduler logic into specialized coordinators: `TaskExecutor`, `ReviewCoordinator`, `SchedulerStateManager`, and `TaskStorage`.
- **Process Abstraction (`ProcessExecutor`)**: Abstracted external process invocation behind `ProcessExecutor` and `NodeProcessExecutor` for consistent cross-platform execution, testing, and real-time streaming.
- **TUI State Management**: Implemented reactive context providers (`ExecutionContext`, `PlanningContext`, `ConfigContext`, `NavigationContext`, `ContainerContext`) for flicker-free terminal updates.
- **Real-Time Log Batching & Ticker Singleton**: Batched execution log streaming and synchronized animated spinners with `SharedSpinnerTicker` to minimize terminal redraw overhead.
- **Robust Terminal Signal Handling**: Added clean SIGINT/SIGTERM handlers and alternate screen buffer restoration across all exit flows.
- **Comprehensive Test Suite**: 385 automated tests across 40 test files covering intent sources, URL parsing, hook dispatchers, verification gates, scheduler lifecycle, delete use cases, and runners.

