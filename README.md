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

The configured AI agent reads the specification and analyzes the existing project.

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

Instead of manually copying prompts between terminals and opening new AI conversations, CodeForge starts the configured AI coding agent as a **child process**.

Conceptually:

```text
CodeForge
    │
    ├── Reads execution state
    │
    ├── Determines ready tasks
    │
    ├── Starts AI agent
    │
    ├── Agent implements task
    │
    ├── Waits for completion
    │
    └── Continues the workflow
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

## 6. Validation

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

The goal is simple:

> **Do not let an invalid AI-generated plan become an execution plan.**

More deterministic implementation checks are part of the project's evolution.

---

## 7. Documentation

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

Examples include:

- Claude Code
- Codex
- Antigravity
- Cursor
- Windsurf
- other CLI-based coding agents

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

A feature can have its own task directory:

```text
.codeforge/
├── specs/
│   └── authentication.md
│
├── plans/
│   └── authentication.json
│
└── tasks/
    └── authentication/
        ├── TASK-001.md
        ├── TASK-002.md
        ├── TASK-003.md
        └── TASK-004.md
```

---

# Commands

## Initialize

```bash
codeforge init
```

Initializes CodeForge in the current repository.

## Create a specification

```bash
codeforge spec create <name>
```

Creates a new Markdown specification.

## Planning

```bash
codeforge plan <spec>
```

Starts the planning workflow using the configured AI agent.

```bash
codeforge plan validate <spec>
```

Validates the generated task graph.

## Execution

```bash
codeforge run <spec>
```

Starts or continues the execution workflow.

CodeForge determines which tasks are ready based on their dependencies and automatically orchestrates the configured AI agent.

## Documentation

```bash
codeforge docs create <spec>
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

## Status

```bash
codeforge status <spec>
```

Displays the current execution state.

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

Then start CodeForge:

```bash
codeforge plan authentication
```

The AI analyzes the specification and repository and creates the task graph.

From there, CodeForge can orchestrate the workflow automatically:

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
- automatic failure recovery;
- smarter retries;
- Git/worktree isolation for parallel tasks;
- richer execution history;
- improved agent adapters;
- automatic task progression;
- deeper documentation tracking;
- architecture and dependency analysis;
- more advanced verification workflows.

---

# Contributing

CodeForge is open source and still evolving.

Issues, discussions, ideas, and pull requests are welcome.

If you try it in a real project, feedback about where the workflow breaks down is especially valuable.

---

# License

MIT