# CodeForge

> **Turn AI coding agents into an automated software development workflow.**

CodeForge is a CLI that orchestrates AI coding agents such as **Claude Code, Codex, Antigravity, Cursor, Windsurf, and others** into a structured and repeatable development workflow.

Instead of asking an AI agent to implement an entire feature in one long context, CodeForge breaks the work into **small, dependency-aware tasks**, executes them automatically, uses fresh contexts, supports parallel execution, and keeps the development process organized from intent to documentation.

```text
INTENT
  │
  ▼
PLAN
  │
  ▼
TASK DAG
  │
  ├──────────────┐
  ▼              ▼
TASK A          TASK B
  │              │
  ▼              ▼
AI AGENT       AI AGENT
  │              │
  └──────┬───────┘
         ▼
    NEXT TASKS
         │
         ▼
       DOCS
         │
         ▼
     COMPLETE
```

> **CodeForge controls the workflow. AI agents handle the implementation.**

---

## Table of Contents

- [The problem](#the-problem)
- [The idea](#the-idea)
- [Why use CodeForge?](#why-use-codeforge)
- [How it works](#how-it-works)
  - [1. Intent](#1-intent)
  - [2. Plan](#2-plan)
  - [3. Automatic execution](#3-automatic-execution)
  - [4. Fresh context per task](#4-fresh-context-per-task)
  - [5. Parallel execution](#5-parallel-execution)
  - [6. Validation & auto-healing](#6-validation--auto-healing)
  - [7. Smart retries & recovery](#7-smart-retries--recovery)
  - [8. Documentation](#8-documentation)
- [Agent agnostic](#agent-agnostic)
- [Deterministic by design](#deterministic-by-design)
- [Hooks](#hooks)
- [Project structure](#project-structure)
- [Commands](#commands)
  - [Quick Reference](#quick-reference)
  - [Configuration & Initialization](#configuration--initialization)
  - [Intent & Planning](#intent--planning)
  - [Execution & Monitoring](#execution--monitoring)
  - [Task Management](#task-management)
  - [Documentation](#documentation)
- [Installation](#installation)
- [Example](#example)
- [Philosophy](#philosophy)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The problem

AI coding agents are extremely capable, but asking an agent to implement an entire feature in one long context can create problems as the change becomes larger:

- Context grows continuously.
- Large features become harder to reason about.
- Work is not explicitly decomposed.
- Dependencies between pieces of work are implicit.
- The agent controls both the implementation **and the development process**.
- Parallel work becomes difficult to coordinate.
- Repeating the same workflow across features is cumbersome.
- Documentation can become disconnected from the code.

CodeForge introduces a layer **around** the AI agent to control the software development workflow.

---

## The idea

The AI should focus on what it does best:

> **Reason about the code and implement the task.**

CodeForge handles the process around it:

> **Decomposition, dependencies, execution state, context isolation, orchestration, validation, and documentation.**

```text
                    CODEFORGE
                        │
                        │
              Controls the workflow
                        │
        ┌───────────────┼───────────────┐
        │               │               │
     PLANNING        EXECUTION     DOCUMENTATION
        │               │               │
      Intent → DAG    AI Coding Agents   Docs
                        │
                ┌───────┼───────┐
                │       │       │
              Claude   Codex    AGY
                │       │       │
                └───────┼───────┘
                        │
                   Source Code
```

CodeForge does **not** provide an AI model and does not require an LLM API key.

It uses the coding agent you already have.

---

# Why use CodeForge?

If you already use Claude Code, Codex, Antigravity, Cursor, or another coding agent, CodeForge adds the **engineering workflow around the agent**.

### Without CodeForge

```text
"Implement this entire feature."

              │
              ▼
          AI Agent
              │
              ▼
        Large context
        Mixed responsibilities
        Implicit dependencies
        Manual coordination
        Harder recovery
```

### With CodeForge

```text
Intent
      │
      ▼
Automatic Planning
      │
      ▼
Dependency DAG
      │
      ├──────────────┐
      ▼              ▼
    Task A         Task B
      │              │
      ▼              ▼
   AI Agent       AI Agent
      │              │
      └──────┬───────┘
             ▼
        Next Tasks
             │
             ▼
        Documentation
             │
             ▼
          Complete
```

The workflow becomes **explicit, observable, and repeatable**.

---

# How it works

## 1. Intent

You describe the feature you want to build in a Markdown intent. You can create one locally or pull an issue directly from an external issue tracker (Linear, GitHub Issues, ClickUp):

```bash
# Create a new local intent template
codeforge intent create user-authentication

# Or pull an issue from an external tracker
codeforge intent pull ENG-123
```

The intent becomes the source of intent for the feature.

You can describe:

- requirements;
- business rules;
- expected behavior;
- API changes;
- acceptance criteria;
- architectural constraints;
- anything else relevant to the implementation.

CodeForge intentionally keeps the intent flexible instead of forcing a rigid schema.

---

## 2. Plan

The configured AI agent reads the intent and analyzes the existing project:

```bash
codeforge plan generate user-authentication
```

It decomposes the feature into executable Tasks and their dependencies.

For example:

```text
TASK-001
Create the User domain model

TASK-002
Create the User repository
depends_on: TASK-001

TASK-003
Implement password hashing
depends_on: TASK-001

TASK-004
Implement registration
depends_on: TASK-002, TASK-003

TASK-005
Implement login
depends_on: TASK-002, TASK-003
```

This creates a **DAG (Directed Acyclic Graph)** of work.

CodeForge validates the generated graph and determines which tasks are ready to execute.

---

## 3. Automatic execution

Once the plan is ready, CodeForge orchestrates the workflow automatically.

Instead of manually copying prompts between terminals and opening new AI conversations, CodeForge executes tasks through a reactive scheduler, starting the configured AI coding agent as a **child process**.

Conceptually:

```text
CodeForge
    │
    ├── Reads execution state & task graph
    │
    ├── Resolves ready tasks via DAG
    │
    ├── Starts AI agent as child process
    │
    ├── Streams prompt & rules via stdin
    │
    ├── Monitors progress & captures errors in real time
    │
    └── Advances the workflow automatically
```

The agent remains responsible for the actual reasoning and code changes.

CodeForge remains responsible for coordinating the process.

---

## 4. Fresh context per task

Each Task is treated as an independent unit of work.

Instead of allowing one conversation to grow indefinitely:

```text
TASK-001 → Context A
TASK-002 → Context B
TASK-003 → Context C
```

CodeForge creates a fresh execution context for each task.

This reduces context accumulation and prevents unrelated previous conversations from becoming part of the next task's working memory.

The task still receives the information it needs to work correctly, such as its intent, dependencies, rules, and relevant project context.

---

## 5. Parallel execution

Tasks that do not depend on each other can be executed concurrently.

For example:

```text
             TASK-001
            /        \
           ▼          ▼
      TASK-002     TASK-003
           │          │
           └────┬─────┘
                ▼
            TASK-004
```

`TASK-002` and `TASK-003` can run in parallel because neither depends on the other.

CodeForge uses the dependency graph to determine what can execute next.

This allows independent work to be processed concurrently instead of forcing every task into a sequential workflow.

---

## 6. Validation & auto-healing

CodeForge validates generated plans before they enter execution.

The validation is deterministic and does not require an AI model.

It can detect problems such as:

- missing required fields;
- invalid task IDs;
- duplicate task IDs;
- invalid dependency references;
- circular dependencies;
- invalid task states;
- structural inconsistencies.

If validation detects errors, CodeForge automatically re-prompts the AI agent with the exact failure diagnostics to repair and self-heal the plan before execution proceeds.

The goal is simple:

> **Do not let an invalid AI-generated plan become an execution plan.**

---

## 7. Smart retries & recovery

When an AI agent encounters a runtime error or fails a task, CodeForge captures the failure output and stack traces in the execution state.

Instead of restarting the entire feature from scratch or manually pasting error logs:

```bash
codeforge task retry <intent>
```

CodeForge injects the previous failure diagnostics directly into the agent's fresh prompt. The agent understands what went wrong and can fix the issue without repeating the same mistake.

You can also inspect task details, reset tasks to pending, or manually mark tasks as complete:

```bash
codeforge task info <intent> <taskId>
codeforge task reset <intent> [taskId]
codeforge task complete <intent> <taskId>
```

---

## 8. Documentation

Documentation is part of the workflow instead of something developers have to remember to do later.

After a feature is completed, CodeForge can create its documentation:

```bash
codeforge docs create <intent>
```

The documentation process uses the feature intent and the implementation context to generate documentation describing what was actually built.

CodeForge also tracks the scope of each document so that documentation can be evaluated when the project changes.

Later:

```bash
codeforge docs update
```

CodeForge analyzes Git changes and determines which documented areas may have been affected.

Instead of sending the entire repository to the AI, it generates a targeted update context containing the relevant changes.

The goal is:

```text
Code change
     │
     ▼
Affected documentation
     │
     ▼
Relevant diff
     │
     ▼
AI update
```

You can also explicitly update a specific document:

```bash
codeforge docs update --doc <name>
```

---

# Agent agnostic

CodeForge does not provide its own AI model.

It orchestrates the coding agent you already use.

Supported agents include:

- **Claude Code** (`claude`)
- **OpenAI Codex** (`codex`)
- **Google Antigravity** (`antigravity` / `agy`)
- **Cursor** (`cursor`)
- other CLI-based coding agents

Process adapters stream prompts through standard input (stdin), avoiding command-line buffer limits on large prompts and rules.

You can also configure separate agents for planning and execution, as well as system language (`en`, `pt`, `es`):

```bash
codeforge config
```

The architecture separates the workflow from the AI provider:

```text
                    CODEFORGE
                        │
                  Orchestration
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
     Claude           Codex        Antigravity
        │               │               │
        └───────────────┼───────────────┘
                        ▼
                   Source Code
```

CodeForge does not require:

- OpenAI API keys;
- Anthropic API keys;
- Gemini API keys;
- a proprietary model;
- a cloud backend.

Your existing AI coding agent performs the AI work.

CodeForge manages the workflow around it.

---

# Deterministic by design

AI is probabilistic.

The more of the development process that can be handled deterministically, the less the AI needs to decide for itself.

CodeForge follows this principle:

```text
AI
 │
 ├── Reasoning
 │
 └── Implementation
        │
        ▼
    CodeForge
        │
        ▼
 Deterministic Systems
        │
        ├── Plan validation
        ├── Dependency validation
        ├── Execution state
        └── Checks
```

The goal is not to make the AI deterministic.

The goal is to **surround probabilistic AI with deterministic systems wherever possible**.

```text
AI
 ↓
Reason
 ↓
Implement
 ↓
CodeForge
 ↓
Verify
 ↓
PASS / FAIL
```

This is one of the core directions of CodeForge:

> **Use AI where probabilistic reasoning is useful and deterministic systems wherever objective verification is possible.**

---

# Hooks

Everything above happens inside CodeForge. Hooks are how it talks to whatever is
outside it, and how whatever is outside it gets a say.

A hook is a command CodeForge runs when something happens during a run. It does
not have to be written in TypeScript, or in any particular language, because the
only contract is a process, an exit code, and a JSON payload.

There are two kinds, and the difference is whether the exit code matters.

| Kind | Exit code | Use it for |
| :--- | :--- | :--- |
| `notify` | reported, never changes anything | telling another system an intent finished, logging, notifications |
| `gate` | non-zero fails the task | linters, type checkers, test suites, policy checks |

`notify` is the default, so a hook you forgot to classify cannot fail your build
by accident.

## Events

| Event | Fires |
| :--- | :--- |
| `run.started` | an intent begins executing |
| `run.completed` | every task finished successfully |
| `run.failed` | the run stopped with at least one failed task |
| `run.deadlock` | tasks remain pending but none can ever become ready |
| `task.started` | a task is dispatched to the agent |
| `task.verify` | the agent returned, **before** the task counts as done |
| `task.completed` | a task passed |
| `task.failed` | a task failed, with its diagnostics |

Only `task.verify` is gate-capable, because it is the only point where a veto
means anything: the agent has finished, and the task is not yet done.

## Configuring them

Hooks live under a `hooks` key in `.codeforge/config.yaml`, grouped by event:

```yaml
environment: claude
plannerAgent: opus
executorAgent: sonnet
language: en
hooks:
  task.verify:
    - name: lint
      run: npm run lint
      type: gate
    - name: tests
      run: npm test
      type: gate
      timeout: 600000
  run.completed:
    - name: notify the tracker
      run: ./scripts/intent-finished.sh
```

Omit the key entirely and nothing changes: no hooks run, and execution behaves
exactly as it does without hook support.

Hooks for one event run **in sequence**, in the order you declare them, because
a hook is allowed to touch the working tree and two of them racing over it would
be unpredictable. Each one has a timeout, five minutes by default.

## Writing one

The event reaches your command on two channels, so you can use whichever is
convenient:

- **stdin**, the whole context as JSON
- **environment**, as `CODEFORGE_EVENT`, `CODEFORGE_INTENT`, `CODEFORGE_TASK_ID`
  and `CODEFORGE_CWD`

A shell script is enough:

```sh
#!/bin/sh
# scripts/intent-finished.sh
echo "$CODEFORGE_INTENT finished" | ./notify-my-team
```

And a gate is just a command that exits non-zero when it disagrees:

```sh
#!/bin/sh
# scripts/gate.sh
if ! npm run typecheck; then
  echo "typecheck failed, the task is not done"
  exit 1
fi
```

## Why a gate is worth more than a check you run yourself

A gate does not only stop a bad task. Its output becomes the task's diagnostics,
and CodeForge already replays those into a fresh prompt on retry.

So the loop closes:

```text
agent implements
      │
      ▼
  task.verify ── gate exits non-zero
      │                   │
      │                   ▼
      │            output recorded as
      │            the task's errors
      │                   │
      │                   ▼
      │         codeforge task retry <intent>
      │                   │
      │                   ▼
      │          fresh prompt, now carrying
      │          the exact failure
      │                   │
      └───────────────────┘
```

The agent finds out what a deterministic tool objected to, in its own words,
without anybody pasting a log. Which means a gate can enforce a rule that was
never written into the task at all, and the agent will still converge on it.

---

# Project structure

After initialization:

```text
.codeforge/
├── docs/
│   └── manifest.json
├── executions/
├── plans/
├── rules/
├── intents/
├── tasks/
└── config.yaml
```

A feature has its intent, execution state, and generated task definitions:

```text
.codeforge/
├── intents/
│   └── authentication.md
│
├── executions/
│   └── authentication.json
│
└── tasks/
    └── authentication/
        ├── TASK-001.json
        ├── TASK-002.json
        ├── TASK-003.json
        └── TASK-004.json
```

---

# Commands

CodeForge commands are organized into logical functional groups. Most commands support interactive prompts when arguments are omitted, providing guided workflows directly in the terminal.

### Quick Reference

| Group                        | Command                                                                     | Description                                                           |
| :--------------------------- | :-------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Configuration & Setup**    | [`codeforge`](#interactive-menu)                                            | Launches the interactive terminal menu with step-by-step navigation   |
|                              | [`codeforge init`](#initialize-workspace)                                   | Initializes CodeForge in the project and sets up AI agent preferences |
|                              | [`codeforge config`](#configuration)                                        | Interactively updates configuration (language, environment, agents)   |
| **Intent & Planning** | [`codeforge intent create [name]`](#create-intent)                     | Creates a new feature intent template                          |
|                              | [`codeforge intent pull [id]`](#pull-intent)                           | Pulls an issue or intent from an external tracker              |
|                              | [`codeforge plan generate [intent]`](#generate-plan)                          | Generates an executable task DAG using the AI planner agent           |
|                              | [`codeforge plan validate [intent] [taskId]`](#validate-plan)                 | Deterministically validates task graph and dependencies               |
| **Execution & Monitoring**   | [`codeforge run [intent]`](#run-autonomous-execution)                         | Autonomously executes tasks in the dependency graph                   |
|                              | [`codeforge status [intent] [--once]`](#status-dashboard)                     | Live execution dashboard (or static status snapshot with `--once`)    |
| **Task Management**          | [`codeforge task info [intent] [taskId]`](#task-info)                         | Displays full details, constraints, and criteria for a task           |
|                              | [`codeforge task retry [intent]`](#retry-failed-tasks)                        | Resets failed tasks with error diagnostics and resumes execution      |
|                              | [`codeforge task reset [intent] [taskId]`](#reset-tasks)                      | Resets tasks to pending state without immediate execution             |
|                              | [`codeforge task complete <intent> <taskId>`](#complete-task-manually)        | Manually marks a task as completed in the execution state             |
| **Documentation**            | [`codeforge docs create [doc-name] [--intent <intent>]`](#create-documentation) | Autonomously creates technical documentation for a completed intent     |
|                              | [`codeforge docs update [intent] [--doc <name>]`](#update-documentation)      | Updates documentation affected by git changes or targeted document    |

---

## Configuration & Initialization

Commands for setting up the environment, initializing the workspace, and configuring AI agents and preferences.

### Interactive Menu

Launches an interactive terminal menu with step-by-step navigation, workflow selection, and back options for all CodeForge operations. Automatically runs when `codeforge` is executed without any arguments.

```bash
codeforge
```

- **Arguments / Options**: None.
- **Example**:
  ```bash
  codeforge
  ```

### Initialize Workspace

Initializes CodeForge in the current repository. Creates the `.codeforge` directory structure, detects installed AI coding CLIs, optionally installs missing agents, and prompts for environment, planner agent, and executor agent preferences.

```bash
codeforge init
```

- **Arguments / Options**: None.
- **Example**:
  ```bash
  codeforge init
  ```

### Configuration

Interactively updates CodeForge configuration settings stored in `.codeforge/config.yaml`. Allows changing the system language (`en`, `pt`, `es`), active environment (`antigravity`, `claude`, `codex`, `cursor`), and assigning dedicated AI agents for planning and execution.

```bash
codeforge config
```

- **Arguments / Options**: None.
- **Example**:
  ```bash
  codeforge config
  ```

#### Configuration File (`.codeforge/config.yaml`)

CodeForge reads workspace configuration from `.codeforge/config.yaml`. Below is a reference configuration showing core settings along with external intent sources:

```yaml
environment: antigravity
plannerAgent: gemini-3.8-flash-high
executorAgent: gemini-3.8-flash-medium
language: en

# External intent source configuration (optional - defaults to filesystem)
intentSource:
  provider: linear          # Supported: filesystem, linear, github, clickup
  apiKeyEnv: LINEAR_API_KEY # Environment variable containing the API token
  team: ENG                 # Optional: team identifier or key filter
  project: Factory          # Optional: project identifier or name filter
```

#### Intent Source Configuration (`intentSource`)

The optional `intentSource` block defines where `codeforge intent pull` fetches remote intents from:

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `provider` | `string` | `"filesystem"` | Provider adapter to use (`filesystem`, `linear`, `github`, `clickup`). |
| `apiKeyEnv` | `string` | `undefined` | Name of the environment variable containing the provider API token. |
| `team` | `string` | `undefined` | Optional team ID, key, or slug filter (e.g. `ENG`). |
| `project` | `string` | `undefined` | Optional project ID, name, or repo filter (e.g. `Factory` or `owner/repo`). |

> **Credential Security:** Never store plain-text API tokens or secrets directly in `.codeforge/config.yaml`. CodeForge uses `apiKeyEnv` to read credentials dynamically from environment variables at runtime (e.g. `export LINEAR_API_KEY="lin_api_..."`). If the referenced environment variable is unset or empty, CodeForge aborts gracefully with a clear diagnostic message without leaking credentials or committing secrets to version control.

---

## Intent & Planning

Commands for creating or pulling feature intents, decomposing them into task graphs (DAG), and validating plan integrity.

### External Ingestion & Local Materialization

CodeForge decouples intent ingestion from execution. Intents can be authored locally via `codeforge intent create` or pulled directly from external issue tracking tools (Linear, GitHub Issues, ClickUp) via `codeforge intent pull`.

When an external issue or story is pulled, it is **materialized locally** into a standard Markdown file under `.codeforge/intents/<id>.md`:

```text
                  EXTERNAL SOURCE
            (Linear / GitHub / ClickUp)
                        │
                        │ codeforge intent pull <id>
                        ▼
             .codeforge/intents/<id>.md
               (Local Materialization)
                        │
                        │ codeforge plan generate <id>
                        ▼
             .codeforge/tasks/<id>/
                  (Task DAG JSON)
                        │
                        │ codeforge run <id>
                        ▼
                  TaskScheduler
                        │
                        ▼
                  Agent Runners
```

Once materialized on disk, the entire subsequent lifecycle (`codeforge plan generate`, `codeforge run`, `codeforge status`, `codeforge task`, `codeforge docs`) remains **100% local, offline, and deterministic**, with zero runtime dependency on external providers or network connectivity.

### Create Intent

Creates a new Markdown intent template under `.codeforge/intents/<name>.md`. Pre-populates standard sections for requirements, business rules, and acceptance criteria. If the name argument is omitted, prompts interactively.

```bash
codeforge intent create [name]
```

- **Arguments**:
  - `[name]`: _(Optional)_ Name or slug of the feature (e.g. `user-authentication`). Normalized to lowercase kebab-case.
- **Examples**:

  ```bash
  # Interactive mode (prompts for feature name)
  codeforge intent create

  # Direct intent creation
  codeforge intent create user-authentication
  ```

### Pull Intent

Pulls a feature intent, user story, or issue from an external issue tracker (such as Linear, GitHub Issues, or ClickUp) and materializes it locally as a standard Markdown intent in `.codeforge/intents/<id>.md`.

If the issue ID argument is omitted, CodeForge queries the configured provider for open issues and presents an interactive selection list (with option to enter an ID manually). If the local intent file already exists, it is updated idempotently with the latest remote content.

```bash
codeforge intent pull [id] [options]
```

- **Arguments**:
  - `[id]`: _(Optional)_ External issue ID or reference key (e.g. `ENG-123`, `42`). Prompts with an interactive list or input prompt if omitted.
- **Options**:
  - `-s, --source <provider>`: _(Optional)_ Overrides the default intent source provider defined in `.codeforge/config.yaml`. Supported providers: `filesystem`, `linear`, `github`, `clickup`.
  - `-n, --name <slug>`: _(Optional)_ Custom filename/slug for the materialized intent file (e.g. `--name social-login` saves to `.codeforge/intents/social-login.md` instead of the default sanitized ID).
- **Examples**:

  ```bash
  # Interactive mode (fetches open issues from configured provider or prompts for ID)
  codeforge intent pull

  # Pull specific issue from configured default provider
  codeforge intent pull ENG-123

  # Pull with a custom local filename
  codeforge intent pull ENG-123 --name user-authentication

  # Pull from a specific provider, overriding config.yaml
  codeforge intent pull 42 --source github

  # Pull from GitHub with a custom filename
  codeforge intent pull 42 --source github --name bugfix-token-refresh
  ```

### Generate Plan

Autonomously decomposes a feature intent into a Directed Acyclic Graph (DAG) of executable JSON tasks under `.codeforge/tasks/<intent>/`. Invokes the configured planner agent, deterministically validates the generated tasks, and automatically re-prompts the AI for self-healing if validation errors are detected.

```bash
codeforge plan generate [intent]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent to plan. Prompts with a selection list if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge plan generate

  # Generate plan for a specific intent
  codeforge plan generate user-authentication
  ```

### Validate Plan

Deterministically validates generated task files against schema structure, task ID formats, dependency references, and circular dependency rules without calling an AI model. Can validate an entire intent graph or target a specific task file.

```bash
codeforge plan validate [intent] [taskId]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent. Prompts interactively if omitted.
  - `[taskId]`: _(Optional)_ Intentific task ID to validate (e.g. `TASK-001`). If omitted, validates all tasks in the intent.
- **Examples**:

  ```bash
  # Validate all tasks in an intent
  codeforge plan validate user-authentication

  # Validate a single task
  codeforge plan validate user-authentication TASK-001
  ```

---

## Execution & Monitoring

Commands for running the autonomous task execution engine and monitoring workflow progress in real time.

### Run Autonomous Execution

Starts or resumes the autonomous execution workflow for an intent. The reactive scheduler resolves the task DAG, isolates fresh context windows per task, streams prompts and rules via stdin, dispatches independent tasks in parallel child processes using the configured executor agent, and marks completed tasks upon successful process termination.

```bash
codeforge run [intent]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent to execute. Prompts interactively if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge run

  # Run execution for an intent
  codeforge run user-authentication
  ```

### Status Dashboard

Displays the execution progress and state of all tasks for an intent. By default, opens a live, flicker-free dashboard in an alternate screen buffer that refreshes every 2 seconds until completion. Use `--once` to print a static snapshot and exit immediately.

```bash
codeforge status [intent] [options]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent. Prompts interactively if omitted.
- **Options**:
  - `--once`: Prints a single snapshot of execution status and exits immediately without entering watch mode.
- **Examples**:

  ```bash
  # Live dashboard watch mode (interactive intent selection)
  codeforge status

  # Live dashboard for a specific intent
  codeforge status user-authentication

  # Print status snapshot once and exit
  codeforge status user-authentication --once
  ```

---

## Task Management

Commands for inspecting, retrying, resetting, and manually completing individual tasks within an execution workflow.

### Task Info

Displays complete metadata and content for a specific task, including title, dependencies, files to modify/create, objective, context, implementation steps, constraints, and acceptance criteria.

```bash
codeforge task info [intent] [taskId]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent. Prompts interactively if omitted.
  - `[taskId]`: _(Optional)_ ID of the task (e.g. `TASK-001`). Prompts interactively if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge task info

  # Inspect a specific task
  codeforge task info user-authentication TASK-001
  ```

### Retry Failed Tasks

Resets all failed tasks in an intent back to pending state and automatically resumes execution. Injects captured error output, failure logs, and diagnostic context from the previous run directly into the AI agent prompt for self-correction.

```bash
codeforge task retry [intent]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent to retry. Prompts interactively if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge task retry

  # Retry failed tasks and resume execution
  codeforge task retry user-authentication
  ```

### Reset Tasks

Resets a specific task or all tasks in an intent back to the `pending` state in the execution state without triggering immediate execution. Allows cleanly re-running tasks on demand.

```bash
codeforge task reset [intent] [taskId]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent. Prompts interactively if omitted.
  - `[taskId]`: _(Optional)_ Intentific task ID to reset (e.g. `TASK-002`). If omitted in interactive mode, prompts to reset an individual task or all tasks.
- **Examples**:

  ```bash
  # Interactive reset prompt
  codeforge task reset

  # Reset a specific task
  codeforge task reset user-authentication TASK-002

  # Interactive reset for a given intent
  codeforge task reset user-authentication
  ```

### Complete Task Manually

Manually marks a specific task as `completed` in the execution state. Useful for recording tasks resolved manually or bypassing an unblockable step. Automatically transitions the overall intent to `completed` if all tasks are finished.

```bash
codeforge task complete <intent> <taskId>
```

- **Arguments**:
  - `<intent>`: _(Required)_ Name of the intent.
  - `<taskId>`: _(Required)_ ID of the task to mark as completed (e.g. `TASK-001`).
- **Examples**:
  ```bash
  codeforge task complete user-authentication TASK-001
  ```

---

## Documentation

Commands for generating and updating technical documentation linked to intents and codebase diffs.

### Create Documentation

Autonomously generates technical documentation for a completed feature using the documentation agent. Reads the intent and the implemented code to produce documentation under `.codeforge/docs/<doc-name>.md` and tracks relevant file path patterns in `.codeforge/docs/manifest.json`.

```bash
codeforge docs create [doc-name] [options]
```

- **Arguments**:
  - `[doc-name]`: _(Optional)_ Name of the document to create. Prompts interactively if omitted.
- **Options**:
  - `--intent <intent>`: _(Optional)_ Name of the completed intent associated with the documentation.
- **Examples**:

  ```bash
  # Interactive mode
  codeforge docs create

  # Create documentation linked to an intent
  codeforge docs create auth-architecture --intent user-authentication
  ```

### Update Documentation

Incrementally updates existing documentation affected by recent codebase changes. In automatic mode, analyzes Git diffs and matches modified files against scope globs in `.codeforge/docs/manifest.json`, prompting the user to review affected docs. With `--doc`, updates a specific document directly.

```bash
codeforge docs update [intent] [options]
```

- **Arguments**:
  - `[intent]`: _(Optional)_ Name of the intent to evaluate changes against. Prompts interactively if omitted.
- **Options**:
  - `--doc <name>`: _(Optional)_ Manually specify which document to update, skipping automated Git scope matching.
- **Examples**:

  ```bash
  # Automatic scope matching via Git diff
  codeforge docs update user-authentication

  # Interactive selection
  codeforge docs update

  # Manually update a specific document
  codeforge docs update user-authentication --doc auth-architecture
  ```

---

# Installation

```bash
npm install -g codeforge-engine
```

Then initialize CodeForge in your project:

```bash
cd my-project
codeforge init
```

You also need a supported AI coding agent installed and authenticated on your machine.

---

# Example

Suppose you want to add authentication.

Create the intent:

```bash
codeforge intent create authentication
```

Write the requirements.

Generate the plan:

```bash
codeforge plan generate authentication
```

The AI analyzes the intent and repository, creates the task graph, and CodeForge validates it.

Start autonomous execution:

```bash
codeforge run authentication
```

From there, CodeForge orchestrates the workflow automatically:

```text
                    Authentication
                         Intent
                          │
                          ▼
                         Plan
                          │
                          ▼
                   Dependency DAG
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
           TASK-001                TASK-002
              │                       │
              ▼                       ▼
           AI Agent                AI Agent
              │                       │
              ▼                       ▼
          Validation              Validation
              │                       │
              └───────────┬───────────┘
                          ▼
                       TASK-003
                          │
                          ▼
                       AI Agent
                          │
                          ▼
                      Validation
                          │
                          ▼
                         Docs
                          │
                          ▼
                      Completed
```

The developer describes **what should be built**.

The AI agents handle **how to implement it**.

CodeForge handles **how the work moves through the development process**.

---

# Philosophy

CodeForge is built around a simple idea:

> **Don't make the AI responsible for the entire software development process.**

Give the AI the problems that require reasoning.

Give the tooling the parts that can be made explicit, deterministic, and repeatable.

```text
AI
 │
 └── Reasoning + Implementation

CodeForge
 │
 ├── Workflow
 ├── State
 ├── Dependencies
 ├── Orchestration
 ├── Context isolation
 └── Documentation

Deterministic Systems
 │
 └── Validation + Verification
```

The goal is not to remove AI from software development.

The goal is to make **AI-assisted development more structured, repeatable, and scalable.**

---

# Roadmap

CodeForge is actively evolving.

Current and planned areas include:

- deterministic implementation checks;
- custom project rules;
- more advanced verification workflows.
- TUI

---

# Contributing

CodeForge is open source and still evolving.

Issues, discussions, ideas, and pull requests are welcome.

For guidelines on setting up your local development environment, coding standards, and submitting pull requests, please see [CONTRIBUTING.md](CONTRIBUTING.md).

If you try it in a real project, feedback about where the workflow breaks down is especially valuable.

---

# License

MIT
