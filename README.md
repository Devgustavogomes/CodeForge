CodeForge

Turn AI coding agents into an automated software development workflow.

CodeForge is a CLI that orchestrates AI coding agents such as Claude Code, Codex, Antigravity, Cursor, Windsurf, and others into a structured and repeatable development workflow.

Instead of asking an AI agent to implement an entire feature in one long context, CodeForge breaks the work into small, dependency-aware tasks, executes them in isolated contexts, runs agents automatically, supports parallel execution, and keeps the development process organized from specification to documentation.

Spec
  ↓
Plan
  ↓
DAG of Tasks
  ↓
Automatic Execution
  ↓
Fresh Context per Task
  ↓
Parallel Tasks
  ↓
Validation
  ↓
Documentation

The problem

AI coding agents are extremely capable, but giving an agent an entire feature and saying “build this” can create problems as the change becomes larger:

* Context grows continuously.
* Large features become harder to reason about.
* Work is not explicitly decomposed.
* Dependencies between pieces of work are implicit.
* The agent controls both the implementation and the development process.
* Parallel work becomes difficult to coordinate.
* Repeating the same workflow across features is cumbersome.
* Documentation can become disconnected from the code.

CodeForge introduces a layer around the AI agent to control the software development workflow.

The idea

The AI should focus on what it does best:

Reason about the code and implement the task.

CodeForge handles the process around it:

Decomposition, dependencies, execution state, context isolation, orchestration, validation, and documentation.

                 CODEFORGE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
   Planning      Execution     Validation
       │             │             │
       │        AI Agents          │
       │       ┌─────┼─────┐       │
       │       ↓     ↓     ↓       │
       │    Claude Codex  AGY      │
       │                         Checks
       └─────────────┬───────────┘
                     ↓
                  Your Code

CodeForge does not provide an AI model and does not require an LLM API key.

It uses the coding agent you already have.

⸻

Why use CodeForge?

If you already use Claude Code, Codex, Antigravity, Cursor, or another coding agent, CodeForge adds the engineering workflow around the agent.

Without CodeForge

"Implement this entire feature."
        ↓
     AI Agent
        ↓
Large context
Mixed responsibilities
Implicit dependencies
Harder recovery
Manual coordination

With CodeForge

Specification
      ↓
Automatic planning
      ↓
Validated dependency graph
      ↓
Task 001 ──────────┐
Task 002 ──────────┤
Task 003 ──────────┤ → Agents
Task 004 ──────────┘
      ↓
Validation
      ↓
Documentation

The workflow becomes explicit, observable, and repeatable.

⸻

How it works

1. Spec

You describe the feature you want to build in a Markdown specification.

codeforge spec create user-authentication

The specification becomes the source of intent for the feature.

You can describe:

* requirements;
* business rules;
* expected behavior;
* API changes;
* acceptance criteria;
* architectural constraints;
* anything else relevant to the implementation.

CodeForge intentionally keeps the specification flexible instead of forcing a rigid schema.

⸻

2. Plan

The configured AI agent reads the specification and analyzes the existing project.

It decomposes the feature into executable Tasks and their dependencies.

For example:

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

This creates a DAG (Directed Acyclic Graph) of work.

CodeForge can therefore determine which tasks are ready to execute and which tasks must wait.

⸻

3. Automatic execution

Once the plan is ready, CodeForge can orchestrate the workflow automatically.

Instead of manually copying prompts between terminals and opening new AI conversations, CodeForge starts the configured AI coding agent as a child process.

Conceptually:

CodeForge
    │
    ├── creates execution context
    │
    ├── starts AI agent
    │
    ├── agent implements Task
    │
    ├── waits for completion
    │
    └── continues the workflow

The agent remains responsible for the actual reasoning and code changes.

CodeForge remains responsible for coordinating the process.

⸻

4. Fresh context per task

Each Task is treated as an independent unit of work.

Instead of allowing the conversation history to grow indefinitely:

TASK-001 → Context A
TASK-002 → Context B
TASK-003 → Context C

CodeForge builds the relevant execution context for each task.

This reduces context accumulation and prevents unrelated previous conversations from becoming part of the next task’s working memory.

⸻

5. Parallel execution

Tasks that do not depend on each other can be executed concurrently.

For example:

             TASK-001
            /        \
           ↓          ↓
      TASK-002     TASK-003
           │          │
           └────┬─────┘
                ↓
            TASK-004

TASK-002 and TASK-003 can run in parallel because neither depends on the other.

CodeForge uses the dependency graph to determine what can safely execute next.

⸻

6. Validation

CodeForge validates generated plans before they enter execution.

The validation is deterministic and does not require an AI model.

It can detect problems such as:

* missing required fields;
* invalid task IDs;
* duplicate task IDs;
* invalid dependency references;
* circular dependencies;
* invalid task states;
* structural inconsistencies.

The goal is simple:

Do not let an invalid AI-generated plan become an execution plan.

⸻

7. Documentation

Documentation is part of the workflow instead of something developers have to remember to do later.

After a feature is completed, CodeForge can create its documentation from the specification and implementation.

codeforge docs create

CodeForge registers the document and its scope in the documentation manifest.

Later, when the code changes:

codeforge docs update

CodeForge analyzes the Git changes and determines which documented areas may have been affected.

Instead of sending the entire repository to the AI, it generates a targeted update context containing the relevant changes.

The goal is:

Code change
     ↓
Affected documentation
     ↓
Relevant diff
     ↓
AI update

This makes documentation maintenance part of the development lifecycle.

⸻

Agent agnostic

CodeForge does not provide its own AI model.

It orchestrates the coding agent you already use.

Examples include:

* Claude Code
* Codex
* Antigravity
* Cursor
* Windsurf
* other CLI-based coding agents

The architecture is intentionally separated:

                 CodeForge
                     │
        orchestration / state
                     │
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
    Claude         Codex       Antigravity
       │             │             │
       └─────────────┼─────────────┘
                     ↓
                 Source Code

CodeForge does not require:

* OpenAI API keys;
* Anthropic API keys;
* Gemini API keys;
* a proprietary model;
* a cloud backend.

Your existing AI coding agent performs the AI work.

CodeForge manages the workflow around it.

⸻

Deterministic by design

AI is probabilistic.

The more of the development process that can be handled deterministically, the less the AI needs to decide for itself.

CodeForge follows this principle:

AI
 ↓
Reasoning
 ↓
Implementation
 ↓
CodeForge
 ↓
Deterministic checks
 ↓
PASS / FAIL

The plan itself is already validated deterministically.

The next layer is implementation verification:

Task
 ↓
Agent
 ↓
Implementation
 ↓
Checks
 ├── tests
 ├── type checking
 ├── lint
 ├── dependency rules
 ├── architecture rules
 └── custom project rules
 ↓
PASS / FAIL

This is one of the core directions of CodeForge: use AI where probabilistic reasoning is useful and deterministic systems wherever objective verification is possible.

⸻

Project structure

After initialization:

.codeforge/
├── docs/
│   └── manifest.json
├── executions/
├── plans/
├── rules/
├── specs/
├── tasks/
└── config.yaml

A feature can have its own task directory:

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

⸻

Commands

Initialize

codeforge init

Initializes CodeForge in the current repository.

Create a specification

codeforge spec create <name>

Creates a new Markdown specification.

Planning

codeforge plan generate <spec>

Starts the planning workflow using the configured AI agent.

codeforge plan validate <spec> [task-id]

Validates the generated task graph.

Execution

codeforge run <spec>

Starts or continues the execution workflow.

CodeForge determines which tasks are ready based on their dependencies and orchestrates the configured AI agent.

Task management

codeforge task complete <spec> <task-id>
codeforge task retry <spec> <task-id>
codeforge task info [spec] [task-id]

Documentation

codeforge docs create
codeforge docs update
codeforge docs update --doc <name>

Status

codeforge status <spec>

Displays the current execution state.

⸻

Installation

npm install -g codeforge-engine

Then initialize CodeForge in your project:

cd my-project
codeforge init

You also need a supported AI coding agent installed and authenticated on your machine.

⸻

Example

Suppose you want to add authentication.

Create the specification:

codeforge spec create authentication

Write the requirements.

Then start CodeForge:

codeforge plan generate authentication

The AI analyzes the specification and repository and creates the task graph.

From there, CodeForge can orchestrate the workflow:

                    Authentication
                         Spec
                          ↓
                         Plan
                          ↓
                   Dependency DAG
                          ↓
              ┌───────────┴───────────┐
              ↓                       ↓
           TASK-001                TASK-002
              ↓                       ↓
           AI Agent                AI Agent
              ↓                       ↓
          Validation              Validation
              └───────────┬───────────┘
                          ↓
                       TASK-003
                          ↓
                       AI Agent
                          ↓
                      Validation
                          ↓
                         Docs
                          ↓
                      Completed

The developer describes what should be built.

The AI agents handle how to implement it.

CodeForge handles how the work moves through the development process.

⸻

Philosophy

CodeForge is built around a simple idea:

Don’t make the AI responsible for the entire software development process.

Give the AI the problems that require reasoning.

Give the tooling the parts that can be made explicit, deterministic, and repeatable.

AI → reasoning + implementation
CodeForge → workflow + state + dependencies + orchestration
Checks → objective verification

The goal is not to remove AI from software development.

The goal is to make AI-assisted development more structured, reproducible, and scalable.

⸻

Roadmap

CodeForge is actively evolving.

Current and planned areas include:

* deterministic implementation checks;
* custom project rules;
* automatic failure recovery;
* smarter retries;
* Git/worktree isolation for parallel tasks;
* richer execution history;
* improved agent adapters;
* automatic task progression;
* deeper documentation tracking;
* architecture and dependency analysis;
* more advanced verification workflows.

⸻

Contributing

CodeForge is open source and still evolving.

Issues, discussions, ideas, and pull requests are welcome.

If you try it in a real project, feedback about where the workflow breaks down is especially valuable.

⸻

License

MIT