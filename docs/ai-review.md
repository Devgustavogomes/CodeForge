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
             All Task Results Integrated
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
       Guarded Delivery             New Tasks Queued
             │                           │
             ▼                           ▼
     Generate Technical Docs       Resume Same Intent
```

- **If the implementation is sound**: The agent exits cleanly without creating any files. After validating the task registry, CodeForge treats this silence as approval and attempts guarded delivery. The intent completes only when delivery succeeds; changes in the original checkout can leave delivery pending.
- **If concrete defects exist**: The reviewer does **not** edit source code directly. Instead, it generates one or more new task files (`.codeforge/tasks/<intent>/TASK-XXX.json`), numbering consecutively after the highest existing task.
- **Self-Healing Continuation**: CodeForge detects the new task files, updates the execution DAG, and pauses with new pending tasks. Run the same intent again to dispatch those fixes through preparation, task verification, commit, and integration before another review/delivery.

---

## Review Context & Inputs

When the AI Review executes, it receives a compact, targeted context window containing:
1. **Original Intent**: The full Markdown feature specification.
2. **Completed Tasks Summary**: Objectives and acceptance criteria of all completed tasks.
3. **Changed-Code Context**: Recorded original-to-accepted commit diff from the integration worktree, including added files; it does not depend on an uncommitted diff in the original checkout.
4. **Existing Task Registry**: List of all existing task IDs to prevent collisions.
5. **Project Review Criteria**: Optional custom review rules defined in `.codeforge/rules/review.md`.

---

## Integration Context and Delivery

The reviewer runs with the integration worktree as its explicit `cwd`. Its prompt points separately to the original checkout's central intent, rules, and task registry. New defect files belong in that central `.codeforge/tasks/<intent>/` directory. Follow-up tasks use distinct task worktrees based on accepted integration history, including their integrated dependencies.

Review begins after all task integrations settle. It is an AI assessment, not a common deterministic lint/build/test gate. Ordinary integration and final delivery add no such gates, and review approval does not guarantee semantic correctness of combined changes. `--skip-review` bypasses AI review only; task verification, integration, and guarded delivery still apply.

Review errors leave the run paused and preserve completed task results. Invalid or partially written new task output is rejected and cleaned up for that failed review attempt. Follow-up rounds are limited by `aiReview.maxRounds`; if that budget is exhausted without approval, delivery stays blocked. Inspect status and review diagnostics before resuming.

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

On the **Run Dashboard** (`Tab 3`), focus the task panel and press `v` to request review when every task is integrated and the dashboard is neither running nor reviewing. The shortcut is unavailable while execution or integration is incomplete.

### Configuration (`.codeforge/config.yaml`)

```yaml
aiReview:
  enabled: true       # Review after task integrations settle (default: false)
  agent: default      # Review agent/model
  maxRounds: 3        # Maximum follow-up rounds
```
