# Configuration Reference

CodeForge stores workspace configuration in `.codeforge/config.yaml`. It also supports environment variable loading and dynamic string interpolation.

---

## Configuration File Schema

Below is an annotated example showing all available configuration options:

```yaml
# Active AI coding CLI environment ('antigravity', 'claude', 'codex', 'cursor')
environment: antigravity

# Dedicated agent models for planning and execution
plannerAgent: gemini-3.8-flash-high
executorAgent: gemini-3.8-flash-medium

# Interface and prompt language ('en', 'pt', 'es')
language: en

# Whether to launch the TUI in an external terminal window (default: true)
externalTerminal: true

# AI Review configuration
aiReview:
  enabled: true                  # Review after all task results are integrated (default: false)
  agent: default                 # Review agent/model (default: "default")
  maxRounds: 3                   # Maximum rounds producing follow-up tasks (default: 3)

# Remote Intent Source configuration (optional - defaults to filesystem)
intentSource:
  provider: linear               # Supported: filesystem, linear, github, clickup
  apiKeyEnv: LINEAR_API_KEY      # Env var name containing the API token
  team: ENG                      # Optional: team identifier filter
  project: Factory               # Optional: project identifier filter

# Lifecycle hooks executed during run events
hooks:
  task.verify:
    - name: typecheck
      run: npm run typecheck
      type: gate                 # 'gate' vetoes task completion on non-zero exit
      timeout: 120000            # Milliseconds (default: 300000 = 5 minutes)
    - name: lint
      run: npm run lint
      type: gate
    - name: tests
      run: npm test
      type: gate
  run.completed:
    - name: notify-tracker
      run: ./scripts/intent-finished.sh
      type: notify               # 'notify' logs output without altering task status
```

---

## Environment Variables & `.env` Support

CodeForge automatically loads environment variables on startup in the following order:
1. System environment variables (`process.env`)
2. Project root `.env`
3. Workspace `.codeforge/.env`

### Variable Interpolation

You can reference environment variables directly in `.codeforge/config.yaml` using `${VARIABLE_NAME}` syntax:

```yaml
intentSource:
  provider: github
  apiKeyEnv: GITHUB_TOKEN
  project: ${GITHUB_REPOSITORY}
```

If an interpolated variable is not defined, CodeForge defaults to an empty string.

---

## Worktree Preparation and Runtime Context

Execution requires Git, a clean named branch with a HEAD commit, npm, and committed `package.json`/`package-lock.json` files usable by `npm ci`. The integration worktree and every task worktree receive their own installation before use. There is no configuration switch to run tasks in the original checkout or skip this preparation.

The `environment`, `executorAgent`, hooks, and review controls select the existing runners and behavior. `codex/` branch names identify CodeForge-owned artifacts for every runner; they do not select the Codex provider. Worktree paths and exact identities are execution records, not user-configurable paths.

Configuration, intent/task definitions, rules, prompts, and state are read from the original checkout's central `.codeforge/`. Agents receive an explicit worktree `cwd`; hooks receive their actual working directory as `CODEFORGE_CWD` and stdin `cwd`. Relative project commands execute against that worktree's files and installed dependencies.

Loading the original checkout's `.env` into CodeForge's process is separate from creating a file in a worktree. Ignored `.env` files are not copied. Child processes can inherit the parent environment, but tools that require a local dotenv file must account for its absence. Worktrees do not isolate external ports, databases, services, or inherited credentials.

Only `task.verify` gates ordinary task approval. No configuration option adds a common integration/final-delivery gate. Conflict resolver attempts reuse `task.verify` in the integration worktree; individual approvals do not establish semantic correctness of the combined result.

See [execution and recovery](cli.md#execution-lifecycle-and-recovery) and [hook working directories](hooks.md#working-directories-and-isolation).

---

## Credential Safety

> [!CAUTION]
> Never put hardcoded tokens, passwords, or secrets into `.codeforge/config.yaml`.

Always reference secrets via `apiKeyEnv` (or root `.env` files that are excluded via `.gitignore`). CodeForge reads the named variable at runtime.

---

## Multi-Language Localization (`i18n`)

CodeForge includes complete translations for prompts, error messages, CLI output, and TUI components:

| Code | Language |
| :--- | :--- |
| `en` | English (Default) |
| `pt` | Português (Portuguese) |
| `es` | Español (Spanish) |

Changing `language` in `config.yaml` or switching it interactively in the TUI (`Config` tab) immediately updates all interface elements, CLI logs, and instructs AI agents to generate prose in the chosen language while preserving technical code terms and JSON keys.
