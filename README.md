# CodeForge

> **Turn AI coding agents into an automated software development workflow.**

CodeForge is a CLI that orchestrates AI coding agents such as **Claude Code, Codex, Antigravity, Cursor, Windsurf, and others** into a structured and repeatable development workflow.

Instead of asking an AI agent to implement an entire feature in one long context, CodeForge breaks the work into **small, dependency-aware tasks**, executes them automatically, uses fresh contexts, supports parallel execution, and keeps the development process organized from specification to documentation.

```text
SPEC
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
  - [1. Spec](#1-spec)
  - [2. Plan](#2-plan)
  - [3. Automatic execution](#3-automatic-execution)
  - [4. Fresh context per task](#4-fresh-context-per-task)
  - [5. Parallel execution](#5-parallel-execution)
  - [6. Validation & auto-healing](#6-validation--auto-healing)
  - [7. Smart retries & recovery](#7-smart-retries--recovery)
  - [8. Documentation](#8-documentation)
- [Agent agnostic](#agent-agnostic)
- [Deterministic by design](#deterministic-by-design)
- [Project structure](#project-structure)
- [Commands](#commands)
  - [Quick Reference](#quick-reference)
  - [Configuration & Initialization](#configuration--initialization)
  - [Specification & Planning](#specification--planning)
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
      Spec → DAG    AI Coding Agents   Docs
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
Specification
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

## 1. Spec

You describe the feature you want to build in a Markdown specification.

```bash
codeforge spec create user-authentication
```

The specification becomes the source of intent for the feature.

You can describe:

- requirements;
- business rules;
- expected behavior;
- API changes;
- acceptance criteria;
- architectural constraints;
- anything else relevant to the implementation.

CodeForge intentionally keeps the specification flexible instead of forcing a rigid schema.

---

## 2. Plan

The configured AI agent reads the specification and analyzes the existing project:

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

The task still receives the information it needs to work correctly, such as its specification, dependencies, rules, and relevant project context.

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
codeforge task retry <spec>
```

CodeForge injects the previous failure diagnostics directly into the agent's fresh prompt. The agent understands what went wrong and can fix the issue without repeating the same mistake.

You can also inspect task details, reset tasks to pending, or manually mark tasks as complete:

```bash
codeforge task info <spec> <taskId>
codeforge task reset <spec> [taskId]
codeforge task complete <spec> <taskId>
```

---

## 8. Documentation

Documentation is part of the workflow instead of something developers have to remember to do later.

After a feature is completed, CodeForge can create its documentation:

```bash
codeforge docs create <spec>
```

The documentation process uses the feature specification and the implementation context to generate documentation describing what was actually built.

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

# Project structure

After initialization:

```text
.codeforge/
├── docs/
│   └── manifest.json
├── executions/
├── plans/
├── rules/
├── specs/
├── tasks/
└── config.yaml
```

A feature has its specification, execution state, and generated task definitions:

```text
.codeforge/
├── specs/
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
| **Specification & Planning** | [`codeforge spec create [name]`](#create-specification)                     | Creates a new feature specification template                          |
|                              | [`codeforge plan generate [spec]`](#generate-plan)                          | Generates an executable task DAG using the AI planner agent           |
|                              | [`codeforge plan validate [spec] [taskId]`](#validate-plan)                 | Deterministically validates task graph and dependencies               |
| **Execution & Monitoring**   | [`codeforge run [spec]`](#run-autonomous-execution)                         | Autonomously executes tasks in the dependency graph                   |
|                              | [`codeforge status [spec] [--once]`](#status-dashboard)                     | Live execution dashboard (or static status snapshot with `--once`)    |
| **Task Management**          | [`codeforge task info [spec] [taskId]`](#task-info)                         | Displays full details, constraints, and criteria for a task           |
|                              | [`codeforge task retry [spec]`](#retry-failed-tasks)                        | Resets failed tasks with error diagnostics and resumes execution      |
|                              | [`codeforge task reset [spec] [taskId]`](#reset-tasks)                      | Resets tasks to pending state without immediate execution             |
|                              | [`codeforge task complete <spec> <taskId>`](#complete-task-manually)        | Manually marks a task as completed in the execution state             |
| **Documentation**            | [`codeforge docs create [doc-name] [--spec <spec>]`](#create-documentation) | Autonomously creates technical documentation for a completed spec     |
|                              | [`codeforge docs update [spec] [--doc <name>]`](#update-documentation)      | Updates documentation affected by git changes or targeted document    |

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

---

## Specification & Planning

Commands for creating feature specifications, decomposing them into task graphs (DAG), and validating plan integrity.

### Create Specification

Creates a new Markdown specification template under `.codeforge/specs/<name>.md`. Pre-populates standard sections for requirements, business rules, and acceptance criteria. If the name argument is omitted, prompts interactively.

```bash
codeforge spec create [name]
```

- **Arguments**:
  - `[name]`: _(Optional)_ Name or slug of the feature (e.g. `user-authentication`). Normalized to lowercase kebab-case.
- **Examples**:

  ```bash
  # Interactive mode (prompts for feature name)
  codeforge spec create

  # Direct specification creation
  codeforge spec create user-authentication
  ```

### Generate Plan

Autonomously decomposes a feature specification into a Directed Acyclic Graph (DAG) of executable JSON tasks under `.codeforge/tasks/<spec>/`. Invokes the configured planner agent, deterministically validates the generated tasks, and automatically re-prompts the AI for self-healing if validation errors are detected.

```bash
codeforge plan generate [spec]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification to plan. Prompts with a selection list if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge plan generate

  # Generate plan for a specific specification
  codeforge plan generate user-authentication
  ```

### Validate Plan

Deterministically validates generated task files against schema structure, task ID formats, dependency references, and circular dependency rules without calling an AI model. Can validate an entire spec graph or target a specific task file.

```bash
codeforge plan validate [spec] [taskId]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification. Prompts interactively if omitted.
  - `[taskId]`: _(Optional)_ Specific task ID to validate (e.g. `TASK-001`). If omitted, validates all tasks in the specification.
- **Examples**:

  ```bash
  # Validate all tasks in a spec
  codeforge plan validate user-authentication

  # Validate a single task
  codeforge plan validate user-authentication TASK-001
  ```

---

## Execution & Monitoring

Commands for running the autonomous task execution engine and monitoring workflow progress in real time.

### Run Autonomous Execution

Starts or resumes the autonomous execution workflow for a specification. The reactive scheduler resolves the task DAG, isolates fresh context windows per task, streams prompts and rules via stdin, dispatches independent tasks in parallel child processes using the configured executor agent, and marks completed tasks upon successful process termination.

```bash
codeforge run [spec]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification to execute. Prompts interactively if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge run

  # Run execution for a spec
  codeforge run user-authentication
  ```

### Status Dashboard

Displays the execution progress and state of all tasks for a specification. By default, opens a live, flicker-free dashboard in an alternate screen buffer that refreshes every 2 seconds until completion. Use `--once` to print a static snapshot and exit immediately.

```bash
codeforge status [spec] [options]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification. Prompts interactively if omitted.
- **Options**:
  - `--once`: Prints a single snapshot of execution status and exits immediately without entering watch mode.
- **Examples**:

  ```bash
  # Live dashboard watch mode (interactive spec selection)
  codeforge status

  # Live dashboard for a specific spec
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
codeforge task info [spec] [taskId]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification. Prompts interactively if omitted.
  - `[taskId]`: _(Optional)_ ID of the task (e.g. `TASK-001`). Prompts interactively if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge task info

  # Inspect a specific task
  codeforge task info user-authentication TASK-001
  ```

### Retry Failed Tasks

Resets all failed tasks in a specification back to pending state and automatically resumes execution. Injects captured error output, failure logs, and diagnostic context from the previous run directly into the AI agent prompt for self-correction.

```bash
codeforge task retry [spec]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification to retry. Prompts interactively if omitted.
- **Examples**:

  ```bash
  # Interactive selection
  codeforge task retry

  # Retry failed tasks and resume execution
  codeforge task retry user-authentication
  ```

### Reset Tasks

Resets a specific task or all tasks in a specification back to the `pending` state in the execution state without triggering immediate execution. Allows cleanly re-running tasks on demand.

```bash
codeforge task reset [spec] [taskId]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification. Prompts interactively if omitted.
  - `[taskId]`: _(Optional)_ Specific task ID to reset (e.g. `TASK-002`). If omitted in interactive mode, prompts to reset an individual task or all tasks.
- **Examples**:

  ```bash
  # Interactive reset prompt
  codeforge task reset

  # Reset a specific task
  codeforge task reset user-authentication TASK-002

  # Interactive reset for a given spec
  codeforge task reset user-authentication
  ```

### Complete Task Manually

Manually marks a specific task as `completed` in the execution state. Useful for recording tasks resolved manually or bypassing an unblockable step. Automatically transitions the overall spec to `completed` if all tasks are finished.

```bash
codeforge task complete <spec> <taskId>
```

- **Arguments**:
  - `<spec>`: _(Required)_ Name of the specification.
  - `<taskId>`: _(Required)_ ID of the task to mark as completed (e.g. `TASK-001`).
- **Examples**:
  ```bash
  codeforge task complete user-authentication TASK-001
  ```

---

## Documentation

Commands for generating and updating technical documentation linked to specifications and codebase diffs.

### Create Documentation

Autonomously generates technical documentation for a completed feature using the documentation agent. Reads the specification and the implemented code to produce documentation under `.codeforge/docs/<doc-name>.md` and tracks relevant file path patterns in `.codeforge/docs/manifest.json`.

```bash
codeforge docs create [doc-name] [options]
```

- **Arguments**:
  - `[doc-name]`: _(Optional)_ Name of the document to create. Prompts interactively if omitted.
- **Options**:
  - `--spec <spec>`: _(Optional)_ Name of the completed specification associated with the documentation.
- **Examples**:

  ```bash
  # Interactive mode
  codeforge docs create

  # Create documentation linked to a spec
  codeforge docs create auth-architecture --spec user-authentication
  ```

### Update Documentation

Incrementally updates existing documentation affected by recent codebase changes. In automatic mode, analyzes Git diffs and matches modified files against scope globs in `.codeforge/docs/manifest.json`, prompting the user to review affected docs. With `--doc`, updates a specific document directly.

```bash
codeforge docs update [spec] [options]
```

- **Arguments**:
  - `[spec]`: _(Optional)_ Name of the specification to evaluate changes against. Prompts interactively if omitted.
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

Create the specification:

```bash
codeforge spec create authentication
```

Write the requirements.

Generate the plan:

```bash
codeforge plan generate authentication
```

The AI analyzes the specification and repository, creates the task graph, and CodeForge validates it.

Start autonomous execution:

```bash
codeforge run authentication
```

From there, CodeForge orchestrates the workflow automatically:

```text
                    Authentication
                         Spec
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
