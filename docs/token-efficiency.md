# Token Efficiency & Context Architecture

A primary failure mode of long-running AI coding sessions is **context bloat**: as conversations lengthen, token consumption accelerates quadratically, models lose focus, hallucinations increase, and costs escalate.

CodeForge is engineered from the ground up for **token efficiency** and strict **context isolation**.

---

## 1. Fresh Context per Task

Instead of asking an AI agent to build an entire feature in a single, ever-growing conversation:

```text
Without CodeForge: Single Monolithic Context
┌─────────────────────────────────────────────────────────────┐
│ Prompt 1 → Code 1 → Prompt 2 → Code 2 → Prompt 3 → Errors...│
│ (200k+ tokens, degrading model attention, high cost)        │
└─────────────────────────────────────────────────────────────┘

With CodeForge: Isolated Task Contexts
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   TASK-001   │   │   TASK-002   │   │   TASK-003   │
│ Fresh Window │   │ Fresh Window │   │ Fresh Window │
│  (Clean AI)  │   │  (Clean AI)  │   │  (Clean AI)  │
└──────────────┘   └──────────────┘   └──────────────┘
```

- Each task in the DAG runs in its own independent child process.
- When an agent finishes a task, its process exits and its working memory is discarded.
- The next task receives a clean slate containing only the specific requirements, target files, acceptance criteria, and project rules relevant to that task.

---

## 2. Decoupled System Contracts & Compact Schemas

CodeForge separates **system operational contracts** from **domain content**:

- **Minimalist Schemas**: Task JSON structures are compact:
  ```json
  {
    "id": "TASK-001",
    "title": "Create User model",
    "objective": "Define User entity and schema",
    "context": "Needs email and hashed password",
    "implementation": "Add User interface in src/domain/user.ts",
    "files": ["src/domain/user.ts"],
    "dependencies": [],
    "constraints": ["Keep immutability"],
    "acceptanceCriteria": ["Exports User interface"]
  }
  ```
- **Streamed via stdin**: Prompts are piped directly via standard input (stdin) rather than command-line arguments, preventing argument buffer overflows and avoiding unnecessary environment serialization.

---

## 3. Stage-Specific Customizable Rules

In large projects, dumping every guideline into every AI call burns tokens and dilutes the model's focus. CodeForge provides isolated rule files under `.codeforge/rules/` for each specific phase:

```text
.codeforge/rules/
├── planning.md      # Injected ONLY during 'codeforge plan generate'
├── running.md       # Injected ONLY during 'codeforge run' (task execution)
├── review.md        # Injected ONLY during the AI Review phase
├── docs.md          # Injected ONLY during 'codeforge docs create'
└── docs-update.md   # Injected ONLY during 'codeforge docs update'
```

### Purpose of Each Rule Template

| Rule File | Injected Stage | What to Put Here |
| :--- | :--- | :--- |
| `planning.md` | Planning / Decomposition | Task granularity preferences, architectural boundaries, slicing rules. |
| `running.md` | Task Execution | Coding standards, linting/typing preferences, testing conventions, library patterns. |
| `review.md` | Post-Execution Review | Critical security checklists, architectural constraints, breaking-change audits. |
| `docs.md` | Doc Creation | Documentation style, terminology conventions, preferred diagrams. |
| `docs-update.md` | Doc Update | Guidelines for preserving existing doc structure during diff-based updates. |

### Optional & Zero-Waste by Design

- If a rule file is empty, whitespace-only, or omitted, CodeForge completely skips its section header in the prompt.
- No wasted tokens or boilerplate headers (`--- PROJECT RULES ---`) are sent when no custom rules exist.
- System contracts (JSON structure, DAG validity, exit criteria) remain fully enforced by CodeForge's core templates regardless of user rule customization.
