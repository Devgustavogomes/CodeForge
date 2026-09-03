# Contributing to CodeForge

Thank you for your interest in contributing to **CodeForge**! 🎉

CodeForge is an agent-agnostic CLI engine designed to structure and orchestrate AI-assisted software development workflows. Our mission is to wrap AI coding agents (such as Claude Code, Codex, Antigravity, Cursor, Windsurf, and others) in a reliable, deterministic, context-isolated engineering process based on dependency graphs (DAGs).

All contributions — bug fixes, new features, documentation improvements, or real-world feedback — are warmly welcomed!

---

## Table of Contents

- [Project Philosophy](#project-philosophy)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Useful Scripts & Commands](#useful-scripts--commands)
- [Architecture Patterns & Code Guidelines](#architecture-patterns--code-guidelines)
  - [Clean Architecture](#clean-architecture)
  - [Strict TypeScript & ESM](#strict-typescript--esm)
  - [Automated Testing](#automated-testing)
  - [Code Quality & Linting](#code-quality--linting)
- [Git Workflow](#git-workflow)
  - [1. Reporting Issues](#1-reporting-issues)
  - [2. Branching Strategy](#2-branching-strategy)
  - [3. Commit Message Conventions](#3-commit-message-conventions)
  - [4. Opening a Pull Request](#4-opening-a-pull-request)
  - [5. Review Process](#5-review-process)
- [Code of Conduct](#code-of-conduct)

---

## Project Philosophy

CodeForge is built on a core principle:

> **Do not make AI responsible for the entire software engineering process.**  
> Give AI the problems that require probabilistic reasoning and code implementation.  
> Delegate to deterministic tooling the steps that can be made explicit, verifiable, and repeatable.

When proposing changes or new features, strive to keep components predictable, honoring the boundary between deterministic orchestration and model execution.

---

## Prerequisites

Before getting started, make sure you have installed:

- **Node.js**: Version `>= 20.0.0` (native ECMAScript Modules are used throughout the project).
- **npm**: Node.js package manager (bundled with Node).
- **Git**: Version control system.
- **AI Coding Agent (Optional for core development, recommended for end-to-end testing)**:
  - Claude Code (`claude`)
  - OpenAI Codex (`codex`)
  - Google Antigravity (`antigravity` / `agy`)
  - Cursor / Windsurf or other supported CLI-based agents.

---

## Local Setup

Follow these steps to set up your local development environment:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Devgustavogomes/Factory.git
   cd Factory
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run in development mode**:  
   Run the CLI directly from TypeScript source files in real time (via `tsx`):

   ```bash
   npm run dev
   ```

   You can pass arguments and subcommands directly using `--`:

   ```bash
   npm run dev -- --help
   npm run dev -- init
   npm run dev -- status --once
   ```

4. **Build the project**:  
   Compile TypeScript source files (`src/`) to JavaScript ESM bundles (`dist/`):

   ```bash
   npm run build
   ```

5. **Run the compiled build**:  
   After building, test the compiled binary:

   ```bash
   npm start
   ```

   To make the `codeforge` command globally available on your machine during local development:

   ```bash
   npm link
   ```

   *(To unlink later, run `npm unlink -g codeforge-engine`)*.

---

## Useful Scripts & Commands

The `package.json` file provides the following essential scripts:

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs the CLI entry point (`src/cli/index.ts`) via `tsx` without requiring a prior build. |
| `npm run build` | Compiles TypeScript into JavaScript distribution files (`dist/`) using `tsc`. |
| `npm start` | Runs the compiled distribution at `dist/cli/index.js` using Node.js. |
| `npm test` | Runs the automated test suite with **Vitest** in single-run mode (`vitest run`). |
| `npm run test:watch` | Starts **Vitest** in watch mode, ideal for test-driven development. |
| `npm run lint` | Runs static code analysis and linting with **ESLint**. |
| `npm run lint:fix` | Runs ESLint with `--fix` to automatically correct formatting and trivial lint issues. |

---

## Architecture Patterns & Code Guidelines

### Clean Architecture

CodeForge follows Clean Architecture principles to ensure loose coupling, high testability, and clear separation of concerns:

```text
src/
├── domain/            # Pure domain models and rules (Task, Plan, ExecutionState, Doc, Hook, etc.)
├── application/       # Use cases, interfaces/ports, and orchestration services
│   ├── ports/         # Abstract contracts and interfaces for persistence and runners
│   ├── services/      # Domain and application services (e.g., PromptService, ConfigService)
│   └── use-cases/     # Use case implementations (init, plan, run, docs, status, etc.)
├── infrastructure/    # Concrete adapters for ports
│   ├── adapters/      # Integrations with Git, file system, CLI installer
│   ├── hooks/         # Hook dispatchers (command-backed, and a no-op)
│   └── repositories/  # On-disk persistence implementations (.codeforge/)
├── runners/           # Adapters for AI CLI agents (Claude, Codex, Antigravity, etc.)
├── scheduler/         # Reactive task scheduler and dependency DAG resolution
├── config/            # Configuration management (config.yaml)
└── cli/               # Presentation layer: Commander commands, interactive menus, terminal UI
```

- **Dependency Rule**: Inner layers (such as `domain`) must never depend on outer layers (such as `infrastructure` or `cli`).
- **Ports & Adapters**: Any access to I/O, subprocesses, or the file system must be defined as an interface in `application/ports` and implemented in `infrastructure/`.

### Strict TypeScript & ESM

- The TypeScript compiler is configured with `strict: true`. All types must be explicitly defined.
- Avoid using `any`. Prefer `unknown`, generics, or explicit union types.
- The project runs as native **ESM (ECMAScript Modules)**. Relative imports of compiled TypeScript modules must include the `.js` extension (e.g., `import { foo } from "./foo.js"`).

### Automated Testing

- All new workflows, use cases, repositories, and deterministic validators must include unit or integration tests.
- Tests are located in the `tests/` directory and powered by **Vitest**.
- Ensure all tests pass before submitting a contribution:

  ```bash
  npm test
  ```

### Code Quality & Linting

- Use ESLint to maintain consistent code quality:

  ```bash
  npm run lint
  ```

- Automatically resolve fixable lint issues:

  ```bash
  npm run lint:fix
  ```

---

## Git Workflow

### 1. Reporting Issues

If you find a bug, an issue in task orchestration, or have a feature suggestion:

- Search existing open and closed issues first to avoid duplicates.
- Open a new issue with:
  - Expected vs. actual behavior;
  - Clear steps to reproduce;
  - Node.js version, operating system, and AI agent used.

### 2. Branching Strategy

Create a descriptive feature branch from the `main` branch:

```bash
git checkout main
git pull origin main
git checkout -b your-contribution-name
```

Recommended branch prefixes:

- `feature/feature-name` for new capabilities;
- `fix/bug-description` for bug fixes;
- `docs/doc-improvement` for documentation updates;
- `refactor/module-name` for code refactoring without external behavior changes;
- `test/test-coverage` for adding or improving tests.

### 3. Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat: add support for new AI execution agent`
- `fix: resolve cyclic dependency error in task scheduler`
- `docs: add English contributing guide and command reference`
- `test: add unit tests for ExecutionStateRepository`
- `refactor: simplify task status mapping logic`

### 4. Opening a Pull Request

When your changes are ready:

1. Verify that the build, tests, and linter all succeed:

   ```bash
   npm run build
   npm test
   npm run lint
   ```

2. Push your branch to GitHub:

   ```bash
   git push origin your-contribution-name
   ```

3. Open a Pull Request targeting the `main` branch.
4. Fill out the PR description template:
   - Summary of changes;
   - Motivation and context;
   - Link related issues (e.g., `Closes #12` or `Resolves #34`).

### 5. Review Process

- Maintainers will review your Pull Request.
- Constructive feedback or minor adjustments may be requested before merging.
- Once approved, your PR will be merged into the project!

---

## Code of Conduct

When participating in the CodeForge project:
- Treat everyone with respect, empathy, and professionalism.
- Offer and accept constructive feedback focused on technical excellence.
- Help foster an inclusive, welcoming, and collaborative open-source community.
