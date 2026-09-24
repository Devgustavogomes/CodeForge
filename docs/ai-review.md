# AI Review Phase

CodeForge includes an autonomous **AI Review Phase** designed to evaluate completed implementations against original feature requirements and acceptance criteria before concluding an intent run.

---

## Why an AI Review Phase?

Individual tasks in a DAG may each pass their local acceptance criteria and unit tests, but the integrated result can still suffer from:
- Subtly missed business logic or acceptance criteria from the original intent.
- Architectural mismatches across files modified by separate tasks.
- Unhandled edge cases and security implications.

The AI Review Phase provides a holistic, post-execution verification step where an AI agent inspects the entire cumulative Git diff produced by the intent.

---

## Design: Silence as the Only Approval Signal

To prevent hallucinations, false positives, or noisy comments, CodeForge enforces an actionable contract:

> **"Create zero files when approved; silence is the only approval signal. Create task files only for concrete, verified defects."**

```text
               All Tasks Completed in DAG
                           │
                           ▼
                  Run AI Review Phase
            (Diff vs Intent vs Acceptance Criteria)
                           │
             ┌─────────────┴─────────────┐
             │                           │
          Approval                    Defects
       (Zero files created)     (New TASK-XXX.json created)
             │                           │
             ▼                           ▼
       Intent Completed             New Tasks Queued
             │                           │
             ▼                           ▼
     Generate Technical Docs     Autonomous Fix Dispatched
```

- **If the implementation is sound**: The agent exits cleanly without creating any files. CodeForge treats this silence as an explicit approval, completing the intent run.
- **If concrete defects exist**: The reviewer does **not** edit source code directly. Instead, it generates one or more new task files (`.codeforge/tasks/<intent>/TASK-XXX.json`), numbering consecutively after the highest existing task.
- **Self-Healing Continuation**: CodeForge detects the new task files, updates the execution DAG, and transitions the intent back to pending so the executor agent can fix the verified defects automatically.

---

## Review Context & Inputs

When the AI Review executes, it receives a compact, targeted context window containing:
1. **Original Intent**: The full Markdown feature specification.
2. **Completed Tasks Summary**: Objectives and acceptance criteria of all completed tasks.
3. **Changed-Code Context**: Cumulative Git diff summary of files modified.
4. **Existing Task Registry**: List of all existing task IDs to prevent collisions.
5. **Project Review Criteria**: Optional custom review rules defined in `.codeforge/rules/review.md`.

---

## Customizing Review Rules

You can inject domain-specific review rules by editing `.codeforge/rules/review.md`:

```markdown
# Project Review Criteria

- Ensure all public API endpoints check authorization scopes.
- Verify database migrations include backward-compatible rollbacks.
- Confirm input validation handles null/undefined payloads safely.
- Check that all newly added dependencies are declared in package.json.
```

These rules are injected directly into the review prompt without cluttering individual task execution prompts.

---

## Triggering and Controlling AI Review

### In the CLI

```bash
# Standard execution (runs review if enabled in config)
codeforge run user-authentication

# Force AI review regardless of configuration
codeforge run user-authentication --review

# Skip AI review for a faster iteration
codeforge run user-authentication --skip-review
```

### In the TUI

On the **Run Dashboard** (`Tab 3`), press `v` at any time to trigger an immediate AI review of the current intent's changes.

### Configuration (`.codeforge/config.yaml`)

```yaml
review:
  enabled: true       # Run automatically after tasks complete
  model: default      # Model or agent to use for review
```
