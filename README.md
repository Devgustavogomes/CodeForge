# CodeForge

> **The engineering workflow engine for AI coding agents.**

CodeForge is a developer CLI and interactive terminal dashboard that wraps around single AI coding agents—such as **Claude Code, OpenAI Codex, Google Antigravity, and Cursor**—to turn them into an automated, structured, and repeatable software development pipeline.

Instead of asking an AI agent to implement an entire feature in one long, hallucination-prone context, CodeForge breaks the work into **small, dependency-aware tasks**, executes them in **fresh, isolated contexts**, validates implementations through **lifecycle hooks and automated AI review**, and keeps technical documentation synchronized.

```text
       INTENT SOURCE
  (Local / Linear / GitHub)
             │
             ▼
       FEATURE INTENT
             │
             ▼
        PLANNING DAG
             │
       ┌─────┴─────┐
       ▼           ▼
    TASK A      TASK B
       │           │
       ▼           ▼
   AI AGENT    AI AGENT   (Fresh Context per Task)
       │           │
       ▼           ▼
   HOOK GATE   HOOK GATE  (Linters / Tests / Typecheck)
       │           │
       └─────┬─────┘
             ▼
        NEXT TASKS
             │
             ▼
       AI REVIEW PHASE    (Holistic Diff Verification)
             │
             ▼
       DOCUMENTATION      (Self-Updating Technical Docs)
             │
             ▼
          COMPLETE
```

> **CodeForge manages the engineering process. Your AI agent handles the implementation.**

---

## What CodeForge Is (and What It Isn't)

Understanding CodeForge starts with knowing where it fits in your toolchain:

| Dimension | Multi-Agent Frameworks (LangGraph, CrewAI, AutoGen) | Interactive Chat IDEs (Cursor Chat, Copilot Chat) | CodeForge |
| :--- | :--- | :--- | :--- |
| **Primary Focus** | Autonomous conversation loops between AI agents | In-editor conversational code suggestions | **Structured engineering workflow around an AI CLI** |
| **Context Model** | Agents pass messages to each other in shared runtime memory | Chat histories accumulate inside IDE buffers | **Fresh, isolated context window per task** |
| **Task Execution** | Open-ended agent-to-agent negotiations | Manual developer copy-pasting and prompting | **Directed Acyclic Graph (DAG) with dependency resolution** |
| **Verification** | Agent self-assessment (often inaccurate) | Manual developer testing in terminal | **Deterministic Gate Hooks (`task.verify`) + Holistic AI Review** |
| **Dependencies** | Requires LLM API keys and cloud agent backends | Requires IDE extension / cloud subscription | **Agent-agnostic CLI runner: uses the tools you already have** |

### CodeForge is:
- **A workflow engine**: Decomposes feature intents into atomic tasks, schedules them by dependency, and dispatches them to your coding agent.
- **A context firewall**: Spawns clean child processes for each task to prevent context degradation and token runaway.
- **An automated feedback loop**: Re-injects linter, compiler, and test errors directly into the agent prompt on retry.
- **100% local and offline**: Remote intents (from Linear, GitHub, ClickUp) are materialized as local markdown files; execution requires zero external API keys.

### CodeForge is NOT:
- **Not an agent orchestrator or conversational agent framework**: CodeForge does not make multiple autonomous AI agents debate or chat with each other. It drives your existing single-agent CLI tool.
- **Not an LLM wrapper**: It does not make direct API calls to OpenAI, Anthropic, or Google. It runs your authenticated coding CLI (`claude`, `codex`, `antigravity`, `cursor`).
- **Not a replacement for human intent**: You define the intent and acceptance criteria; CodeForge ensures the implementation adheres to them.

---

## Key Highlights

- **Terminal User Interface (TUI)**: Full-screen dashboard built with Ink and React. Features an onboarding wizard, real-time log streaming with syntax highlighting, task DAG tree inspection, and modal editors.
- **External Terminal Launcher**: Launches in an external terminal window by default for optimal rendering, with `--inline` support for single-terminal workflows.
- **Remote Intent Ingestion**: Ingests user stories and issues from Linear, GitHub Issues, ClickUp, or the local filesystem, materializing them into offline markdown intents.
- **Lifecycle Hooks**: Extensible hook system with `gate` and `notify` types. Non-zero exits on `task.verify` (e.g. `npm test`, `cargo test`) veto tasks and automatically replay error diagnostics into the agent's prompt.
- **Holistic AI Review**: An automated review step where an AI reviewer inspects the cumulative Git diff against the intent. Enforces **silence as approval**: zero files created means pass; concrete defects spawn new DAG tasks.
- **Token Efficiency & Customizable Rules**: Prompts decouple system contracts from user guidelines. Project rules under `.codeforge/rules/` are stage-specific (`planning.md`, `running.md`, `review.md`, `docs.md`) and strictly optional.
- **Multi-Language Support (`i18n`)**: Native interface, CLI, and prompt support for English (`en`), Portuguese (`pt`), and Spanish (`es`).

---

## Quick Start

### 1. Installation

Install CodeForge globally via npm:

```bash
npm install -g codeforge-engine
```

Ensure you have at least one supported AI coding CLI installed and authenticated:
- **Claude Code** (`claude`)
- **OpenAI Codex** (`codex`)
- **Google Antigravity** (`antigravity` / `agy`)
- **Cursor** (`cursor`)

### 2. Initialization

Navigate to your project repository and launch CodeForge:

```bash
cd my-project
codeforge
```

If CodeForge is not yet initialized in the project, the interactive **Onboarding Wizard** will launch automatically to detect your installed CLIs, set your preferred language, and generate your workspace configuration.

*(Alternatively, you can initialize non-interactively using `codeforge init`.)*

### 3. Basic Workflow

#### Step 1: Create or Pull an Intent

Describe what you want to build in a Markdown intent, or pull an issue from your tracker:

```bash
# Create local template in .codeforge/intents/user-authentication.md
codeforge intent create user-authentication

# Or pull an existing issue from Linear / GitHub
codeforge intent pull ENG-123
```

#### Step 2: Generate the Plan

The planner agent analyzes the intent and codebase, decomposing the work into an atomic task DAG:

```bash
codeforge plan generate user-authentication
```

#### Step 3: Run Autonomous Execution

CodeForge executes tasks in topological order, isolating context per task and running verification hooks:

```bash
codeforge run user-authentication
```

#### Step 4: Generate Technical Documentation

When all tasks pass verification and AI review, generate technical documentation:

```bash
codeforge docs create auth-architecture --intent user-authentication
```

---

## Project Structure

When CodeForge is initialized, it creates a `.codeforge/` workspace:

```text
.codeforge/
├── config.yaml          # Workspace preferences, agents, hooks, and intent sources
├── metadata.json        # Workspace identification and initialized timestamp
├── intents/             # Feature specifications (Markdown)
│   └── user-auth.md
├── tasks/               # Generated task DAGs (JSON)
│   └── user-auth/
│       ├── TASK-001.json
│       └── TASK-002.json
├── executions/          # Runtime execution state and captured failure logs
│   └── user-auth.json
├── rules/               # Optional stage-specific guidelines
│   ├── planning.md      # Injected during plan generation
│   ├── running.md       # Injected during task execution
│   ├── review.md        # Injected during AI review
│   └── docs.md          # Injected during documentation generation
└── docs/                # Generated technical documentation
    └── manifest.json    # Scope tracking for automated documentation updates
```

---

## Documentation Index

Explore our comprehensive guides for in-depth documentation:

| Guide | Description |
| :--- | :--- |
| **[CLI Reference](docs/cli.md)** | Complete reference for all CLI commands, arguments, options, and exit codes. |
| **[Terminal User Interface (TUI)](docs/tui.md)** | Interactive screen navigation, hotkeys, log streaming, and onboarding wizard. |
| **[Remote Intent Sources](docs/intent-sources.md)** | Connecting Linear, GitHub Issues, and ClickUp with credential safety and local materialization. |
| **[Lifecycle Hooks](docs/hooks.md)** | Configuring gate hooks (`task.verify`), notify hooks, and the self-healing error diagnostics loop. |
| **[AI Review Phase](docs/ai-review.md)** | Post-execution diff review, silence-as-approval design, and auto-generated defect tasks. |
| **[Token Efficiency & Rules](docs/token-efficiency.md)** | Context window isolation, lean prompt contracts, and stage-specific project rules. |
| **[Configuration Reference](docs/configuration.md)** | Detailed schema for `.codeforge/config.yaml`, `.env` integration, and variable interpolation. |

---

## Contributing

CodeForge is open-source software. Issues, discussions, ideas, and pull requests are welcome.

For guidelines on setting up your local development environment, running tests, and submitting pull requests, please read [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
