# CodeForge

[🇧🇷 Português](#-português)

CodeForge is an agent-agnostic CLI for structuring and orchestrating AI-assisted software development.

Instead of asking an AI coding agent to implement an entire feature in a single context, CodeForge provides a controlled development workflow:

**Spec → Plan → Approval → Task → Fresh Context → Implementation → Validation**

CodeForge does not provide an AI model and does not depend on a specific AI provider. You can use it with the coding agent you already use, such as Claude Code, Codex, Antigravity, Cursor, Windsurf, or others.

The AI provides the reasoning and implementation capabilities.

CodeForge provides the **process, state, context, and deterministic validation** around that agent.

---

## Table of Contents
- [Installation](#installation)
- [How It Works](#how-it-works)
  - [1. Spec](#1-spec)
  - [2. Plan](#2-plan)
  - [3. Validate](#3-validate)
  - [4. Human Approval](#4-human-approval)
  - [5. Execute](#5-execute)
  - [6. Fresh Contexts](#6-fresh-contexts)
- [Architecture](#architecture)
- [Commands](#commands)
- [Recommended Workflow](#recommended-workflow)
- [Project Structure](#project-structure)
- [Why CodeForge?](#why-codeforge)
- [Agent Agnostic](#agent-agnostic)
- [Deterministic Validation](#deterministic-validation)
- [Roadmap](#roadmap)

---

## Installation

```bash
npm install -g codeforge
```

For development:

```bash
npm install
npm run build
npm link
```

---

## How It Works

The core philosophy of CodeForge is:

> **Plan first. Execute one task at a time. Keep execution contexts isolated.**

A feature goes through the following workflow:

```text
                    SPEC
                     │
                     ▼
                  PLANNER
                     │
                     ▼
                   PLAN
               ┌─────┴─────┐
               │           │
            TASK-001    TASK-002
               │           │
               └─────┬─────┘
                     │
                     ▼
              HUMAN APPROVAL
                     │
                     ▼
              TASK EXECUTION
                     │
                     ▼
             FRESH CONTEXT
                     │
                     ▼
                  AI AGENT
                     │
                     ▼
              IMPLEMENTATION
                     │
                     ▼
               VALIDATION
                     │
                     ▼
                NEXT TASK
```

### 1. Spec

You write a high-level specification describing what you want to build.

The specification is intentionally unstructured.

CodeForge does not require a specific template or schema. You can write your specification however you want, as long as it communicates the desired change.

For example:

```text
# User Authentication

We need to add authentication to the application.

Users should be able to register and log in.

Passwords must never be stored in plaintext.

The API should expose endpoints for registration and login.
...
```

The original specification is preserved as the source of intent.

### 2. Plan

The AI coding agent reads the specification and analyzes the existing project.

It then breaks the work into a set of Tasks.

The Plan is the complete decomposition of the specification into those Tasks.

For example:

```text
PLAN: User Authentication

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

Tasks form a dependency graph, allowing CodeForge to determine which work can be executed next.

### 3. Validate

The generated Plan is validated by CodeForge.

The validation is deterministic and does not require an AI model.

CodeForge can verify things such as:
- required fields;
- valid Task identifiers;
- dependency references;
- duplicate identifiers;
- circular dependencies;
- invalid task states;
- structural consistency.

The goal is to prevent an invalid AI-generated Plan from entering the execution phase.

### 4. Human Approval

The Plan is not executed immediately.

The developer reviews the generated Tasks and approves the Plan.

This creates an explicit boundary between:

```text
AI interpretation
      ↓
Human decision
      ↓
AI implementation
```

The developer remains in control of what will actually be implemented.

### 5. Execute

After the Plan is approved, CodeForge selects the next Task whose dependencies have been completed.

Instead of giving the AI the entire conversation history, CodeForge builds the context required for that specific Task.

The execution follows:

```text
Task
 ↓
Relevant specification
 ↓
Required project context
 ↓
Rules
 ↓
Fresh AI context
```

The AI agent then implements only that Task.

### 6. Fresh Contexts

Each Task is intended to be executed in a new AI context window.

For example:

```text
TASK-001
   ↓
Context Window #1
   ↓
implementation
   ↓
completed

TASK-002
   ↓
Context Window #2
   ↓
implementation
   ↓
completed

TASK-003
   ↓
Context Window #3
```

The context from Task 001 is not implicitly carried into Task 002.

Instead, CodeForge provides the information required to continue the work.

This reduces context accumulation and makes each unit of work explicit and reproducible.

## Architecture

CodeForge intentionally separates the development process from the AI agent.

```text
┌──────────────────────────────────────┐
│              CODEFORGE               │
│                                      │
│  Workflow                            │
│  Rules                               │
│  State                               │
│  Context                             │
│  Task management                     │
│  Deterministic validation            │
└──────────────────┬───────────────────┘
                   │
                   │ instructions/context
                   ▼
┌──────────────────────────────────────┐
│             AI AGENT                 │
│                                      │
│ Claude Code / Codex / Antigravity /  │
│ Cursor / Windsurf / etc.             │
└──────────────────┬───────────────────┘
                   │
                   ▼
              Source Code
```

CodeForge does not call an LLM API.

It does not require:
- OpenAI API keys;
- Anthropic API keys;
- Gemini API keys;
- a specific AI provider;
- a specific AI coding agent.

The agent you already use performs the AI work.

## Commands

### Interactive Menu

- \`codeforge\`
  Running the command without any arguments opens an interactive menu that guides you through all available actions (Init, Create Spec, Plan, Execute, Status).

### Setup

- \`codeforge init\`
  Initializes CodeForge in the current project.
  Creates the \`.codeforge\` workspace containing the specifications, plans, tasks, execution state, and CodeForge rules.

### Specifications

- \`codeforge spec create <name>\`
  Creates a new Markdown specification in \`.codeforge/specs/<name>.md\`.
  The specification is intentionally free-form.

### Planning

- \`codeforge plan generate <spec>\`
  Prepares the planning instructions/context for the AI coding agent.
  The agent reads the specification and generates the Plan as a set of Tasks.

- \`codeforge plan validate <spec> [task-id]\`
  Deterministically validates the generated Tasks and their dependency graph.
  If validation fails, the AI agent can use the reported errors to correct the Plan.
  The Plan must pass validation before execution.

### Execution

- \`codeforge run <spec>\`
  Finds the next executable Task based on its dependencies and prepares the context/instructions required by the AI agent.
  The Task is intended to be executed in a fresh AI context.

- \`codeforge task complete <spec> <task-id>\`
  Marks a Task as completed.

- \`codeforge task retry <spec> <task-id>\`
  Returns a failed or stuck Task to the pending state so it can be executed again.

### Status

- \`codeforge status <spec>\`
  Displays the current execution state of the implementation. Use \`codeforge status <spec> --once\` to display the status once instead of continuously watching for changes.

## Recommended Workflow

1. **Initialize the project**
   \`codeforge init\`
2. **Create the specification**
   \`codeforge spec create user-authentication\`
   Write the specification in \`.codeforge/specs/user-authentication.md\`.
3. **Generate the Plan**
   \`codeforge plan generate user-authentication\`
   Give the generated instructions to your AI coding agent.
   The agent analyzes the specification and project and creates the Tasks.
4. **Validate the Plan**
   \`codeforge plan validate user-authentication\`
   If validation fails, let the AI correct the generated Tasks.
   Repeat until: ✓ Plan is valid.
5. **Review and approve**
   Review the Tasks and their dependencies.
   Only after you approve the Plan should implementation begin.
6. **Start execution**
   \`codeforge run user-authentication\`
   CodeForge prepares the next Task and its execution context.
7. **Use a fresh AI context**
   Open a new context window in your coding agent.
   Give it the generated execution instructions.
   The agent implements the Task.
8. **Complete the Task**
   After the implementation is finished:
   \`codeforge task complete user-authentication TASK-001\`
9. **Repeat**
   \`codeforge run\` → new context → implement Task → complete Task → \`codeforge run\`...
   Continue until all Tasks in the Plan are completed.

## Project Structure

After initialization:

```text
.codeforge/
├── executions/
├── plans/
├── rules/
├── specs/
├── tasks/
└── config.yaml
```

A feature can have its own Tasks:

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

Each Task represents one independently executable unit of work.

## Why CodeForge?

AI coding agents are extremely capable, but large software changes can become difficult to control when everything is performed in a single context.

CodeForge introduces explicit boundaries:

```text
Large specification
       ↓
Small Tasks
       ↓
Explicit dependencies
       ↓
Human approval
       ↓
One Task
       ↓
Fresh context
       ↓
Deterministic validation
```

This makes AI-assisted development more:
- predictable;
- inspectable;
- reproducible;
- modular;
- resistant to context accumulation;
- easier to debug.

## Agent Agnostic

CodeForge is designed to work with the AI coding agent you already use.

For example:

```text
             CodeForge
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
   Claude      Codex   Antigravity
     Code
       │         │         │
       └─────────┼─────────┘
                 ▼
             Your Code
```

The CodeForge workflow should not depend on the underlying model.

## Deterministic Validation

AI is probabilistic.

The parts of the development process that can be verified deterministically should therefore be handled by CodeForge rather than delegated to the AI.

For example:

```text
AI
 ↓
generates Tasks
 ↓
CodeForge
 ↓
deterministic validation
 ↓
PASS / FAIL
```

The same principle will be used for future implementation checkers such as:
- tests;
- type checking;
- linting;
- dependency validation;
- architecture rules;
- custom project rules;
- security checks.

## Roadmap

CodeForge is being developed incrementally. Planned capabilities include:

- [x] Project initialization
- [x] Specification creation
- [x] Plan generation workflow
- [x] Plan validation
- [x] Task dependency graph
- [x] Task execution workflow
- [x] Execution state tracking
- [ ] Deterministic implementation checkers
- [ ] Automatic task progression
- [ ] Rich execution context generation
- [ ] Agent integrations
- [ ] Retry and failure recovery
- [ ] Execution history
- [ ] More advanced workflow rules

---

# 🇧🇷 Português

O CodeForge é uma CLI independente de agente para estruturar e orquestrar o desenvolvimento de software assistido por IA.

Em vez de pedir a um agente de codificação de IA para implementar uma funcionalidade inteira em um único contexto, o CodeForge fornece um fluxo de desenvolvimento controlado:

**Spec → Plano → Aprovação → Tarefa → Contexto Limpo → Implementação → Validação**

O CodeForge não fornece um modelo de IA e não depende de um provedor de IA específico. Você pode usá-lo com o agente de codificação que já utiliza, como Claude Code, Codex, Antigravity, Cursor, Windsurf ou outros.

A IA fornece o raciocínio e a capacidade de implementação.

O CodeForge fornece o **processo, estado, contexto e validação determinística** em torno desse agente.

---

## Sumário
- [Instalação](#instalação)
- [Como Funciona](#como-funciona)
  - [1. Spec (Especificação)](#1-spec-especificação)
  - [2. Plan (Planejamento)](#2-plan-planejamento)
  - [3. Validação](#3-validação)
  - [4. Aprovação Humana](#4-aprovação-humana)
  - [5. Execução](#5-execução)
  - [6. Contextos Limpos](#6-contextos-limpos)
- [Arquitetura](#arquitetura)
- [Comandos Principais](#comandos-principais)
- [Por que o CodeForge?](#por-que-o-codeforge)

---

## Instalação

```bash
npm install -g codeforge
```

Para desenvolvimento:

```bash
npm install
npm run build
npm link
```

---

## Como Funciona

A filosofia principal do CodeForge é:

> **Planeje primeiro. Execute uma tarefa de cada vez. Mantenha os contextos de execução isolados.**

Uma funcionalidade passa pelo seguinte fluxo:

```text
                    SPEC
                     │
                     ▼
                 PLANEJADOR
                     │
                     ▼
                   PLANO
               ┌─────┴─────┐
               │           │
            TASK-001    TASK-002
               │           │
               └─────┬─────┘
                     │
                     ▼
              APROVAÇÃO HUMANA
                     │
                     ▼
             EXECUÇÃO DE TAREFA
                     │
                     ▼
               CONTEXTO LIMPO
                     │
                     ▼
                AGENTE DE IA
                     │
                     ▼
               IMPLEMENTAÇÃO
                     │
                     ▼
                 VALIDAÇÃO
                     │
                     ▼
               PRÓXIMA TAREFA
```

### 1. Spec (Especificação)

Você escreve uma especificação de alto nível descrevendo o que deseja construir.
A especificação é intencionalmente não estruturada. O CodeForge não exige um template ou esquema específico. 

### 2. Plan (Planejamento)

O agente de codificação de IA lê a especificação e analisa o projeto existente.
Em seguida, ele divide o trabalho em um conjunto de Tarefas (Tasks).

As tarefas formam um grafo de dependência, permitindo ao CodeForge determinar qual trabalho pode ser executado em seguida.

### 3. Validação

O Plano gerado é validado pelo CodeForge.
A validação é determinística e não requer um modelo de IA. O objetivo é evitar que um plano gerado por IA inválido entre na fase de execução.

### 4. Aprovação Humana

O Plano não é executado imediatamente.
O desenvolvedor revisa as Tarefas geradas e aprova o Plano.

### 5. Execução

Após a aprovação do Plano, o CodeForge seleciona a próxima Tarefa cujas dependências foram concluídas.
Em vez de passar para a IA todo o histórico da conversa, o CodeForge constrói o contexto necessário especificamente para aquela Tarefa.

### 6. Contextos Limpos

Cada Tarefa deve ser executada em uma **nova janela de contexto** da IA.
O contexto da Tarefa 001 não é implicitamente carregado para a Tarefa 002.
Isso reduz o acúmulo de contexto e torna cada unidade de trabalho explícita e reproduzível.

## Arquitetura

O CodeForge separa intencionalmente o processo de desenvolvimento do agente de IA.
O CodeForge não chama a API de um LLM e não exige chaves de API. O agente que você já usa realiza o trabalho de IA.

## Comandos Principais

- \`codeforge\` - Abre um menu interativo com todas as opções abaixo
- \`codeforge init\` - Inicializa o projeto
- \`codeforge spec create <nome>\` - Cria uma nova spec
- \`codeforge plan generate <spec>\` - Gera prompt para planejar as tasks
- \`codeforge plan validate <spec>\` - Valida as tasks geradas
- \`codeforge run <spec>\` - Pega a próxima task pronta para execução
- \`codeforge status <spec>\` - Mostra painel de andamento
- \`codeforge task complete <spec> <task-id>\` - Completa uma task
- \`codeforge task retry <spec> <task-id>\` - Retorna task com erro para pendente

## Por que o CodeForge?

Agentes de IA são extremamente capazes, mas grandes mudanças em softwares tornam-se difíceis de controlar quando tudo é executado em um único contexto.
O CodeForge introduz limites explícitos.
Isso torna o desenvolvimento com IA mais previsível, reproduzível, modular e resistente ao acúmulo de contexto.
