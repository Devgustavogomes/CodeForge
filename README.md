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

## Interactive menu

```bash
codeforge
```

Launches an interactive terminal menu with step-by-step navigation and back options for all workflows.

## Configuration

```bash
codeforge config
```

Interactively configures your environment, AI agents (separately for planning and execution), and system language (`en`, `pt`, `es`).

## Initialize

```bash
codeforge init
```

Initializes CodeForge in the current repository and guides environment setup.

## Create a specification

```bash
codeforge spec create [name]
```

Creates a new Markdown specification. Prompts interactively if the name is omitted.

## Planning

```bash
codeforge plan generate [spec]
```

Autonomously generates the task DAG using the configured planner agent, with automatic validation and self-healing.

```bash
codeforge plan validate [spec]
```

Validates the task graph deterministically against schema, dependency, and DAG rules.

## Execution

```bash
codeforge run [spec]
```

Starts or continues the autonomous execution workflow. The reactive scheduler resolves dependencies and dispatches tasks with fresh contexts and live progress monitoring.

## Task management

```bash
codeforge task retry [spec]
```

Retries failed tasks for a spec and resumes execution, injecting prior failure errors and diagnostic context into the agent prompt for self-correction.

```bash
codeforge task reset [spec] [taskId]
```

Resets a specific task or all tasks in a spec back to pending state without immediately executing.

```bash
codeforge task info [spec] [taskId]
```

Displays comprehensive task details, including objective, context, files to modify, constraints, and acceptance criteria.

```bash
codeforge task complete <spec> <taskId>
```

Manually marks a specific task as completed in the execution state.

## Status

```bash
codeforge status [spec]
```

Opens a live, flicker-free execution dashboard in an alternate screen buffer, watching progress in real time.

```bash
codeforge status [spec] --once
```

Prints the current execution status snapshot once and exits.

## Documentation

```bash
codeforge docs create [doc-name] [--spec <spec>]
```

Creates documentation for a completed feature.

```bash
codeforge docs update
```

Detects documentation potentially affected by Git changes.

```bash
codeforge docs update --doc <name>
```

Updates a specific document directly.

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

If you try it in a real project, feedback about where the workflow breaks down is especially valuable.

---

# License

MIT
