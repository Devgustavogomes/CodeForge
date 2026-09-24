# Remote Intent Sources

CodeForge decouples feature ingestion from execution. Rather than being tied to local files or a specific project management platform, CodeForge can ingest tasks and user stories directly from issue tracking tools (Linear, GitHub Issues, ClickUp) or manage them locally via the filesystem.

---

## The Concept: External Ingestion & Local Materialization

Remote issue tracking often involves cloud state, rate limits, and network volatility. CodeForge isolates this by introducing **Local Materialization**:

```text
               EXTERNAL TRACKER
          (Linear / GitHub / ClickUp)
                       │
                       │ codeforge intent pull <id>
                       ▼
           .codeforge/intents/<id>.md
             (Local Materialization)
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
codeforge plan generate       codeforge run
 (100% Local & Offline)    (100% Local & Offline)
```

1. **Pull & Materialize**: An issue or story is fetched once and materialized locally as a standard Markdown file under `.codeforge/intents/<id>.md`.
2. **Offline Execution**: Once materialized, the entire remaining development lifecycle (planning, task DAG generation, execution, hooks, review, and docs) is **100% local, offline, and deterministic**. There are no runtime dependencies on external APIs or network connectivity.

---

## Supported Providers

| Provider | Identifier | Required Credential Env Var | Supported Input Formats |
| :--- | :--- | :--- | :--- |
| **Filesystem** | `filesystem` | None (Local files) | File slug / name |
| **Linear** | `linear` | `LINEAR_API_KEY` | Issue key (`ENG-123`), issue URL |
| **GitHub Issues** | `github` | `GITHUB_TOKEN` | Issue number (`42`), issue URL |
| **ClickUp** | `clickup` | `CLICKUP_API_KEY` | Task ID (`8686...`), task URL |

---

## Configuration (`.codeforge/config.yaml`)

Configure your default intent source under the `intentSource` block:

```yaml
environment: antigravity
plannerAgent: gemini-3.8-flash-high
executorAgent: gemini-3.8-flash-medium
language: en

# Intent Source Configuration
intentSource:
  provider: linear
  apiKeyEnv: LINEAR_API_KEY   # Name of the environment variable containing the token
  team: ENG                   # Optional team or project filter
  project: CoreApp            # Optional project name or repo filter
```

### Configuration Options

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `provider` | `string` | `"filesystem"` | Provider adapter to use (`filesystem`, `linear`, `github`, `clickup`). |
| `apiKeyEnv` | `string` | `undefined` | Name of the environment variable holding your API token. |
| `team` | `string` | `undefined` | Optional team ID or key filter (e.g. `ENG`). |
| `project` | `string` | `undefined` | Optional project name or repository filter (`owner/repo`). |

---

## Credential Security

> [!IMPORTANT]
> **Never commit API tokens or plain-text credentials to version control.**

CodeForge enforces secure credential management through environment variable references:
- In `.codeforge/config.yaml`, the `apiKeyEnv` field stores only the **name** of the environment variable (e.g. `LINEAR_API_KEY` or `GITHUB_TOKEN`), not the token value itself.
- CodeForge reads credentials at runtime from your environment or `.env` files.
- If the referenced environment variable is missing or empty, CodeForge aborts gracefully with a diagnostic error without exposing secrets.

---

## Usage

### 1. Interactive Issue Selection

If you run `codeforge intent pull` without an ID, CodeForge connects to the configured provider, fetches active open issues matching your team/project filter, and displays an interactive list:

```bash
codeforge intent pull
```

### 2. Pulling by Issue Identifier or Key

```bash
# Linear issue key
codeforge intent pull ENG-204

# GitHub issue number (uses configured project: owner/repo)
codeforge intent pull 142
```

### 3. Pulling Directly by URL

CodeForge automatically parses provider URLs:

```bash
# Linear URL
codeforge intent pull https://linear.app/my-org/issue/ENG-204/add-oauth-flow

# GitHub Issues URL
codeforge intent pull https://github.com/my-org/my-repo/issues/142

# ClickUp Task URL
codeforge intent pull https://app.clickup.com/t/8675309/ENG-101
```

### 4. Overriding Provider and Customizing Local Slug

```bash
# Pull from GitHub even if Linear is default
codeforge intent pull 42 --source github

# Specify custom local slug for the materialized markdown file
codeforge intent pull ENG-204 --name social-authentication
# Result: saved to .codeforge/intents/social-authentication.md
```
