import { HookDispatcher } from "../../application/ports/HookDispatcher.js";
import { HookReporter } from "../../application/ports/HookReporter.js";
import {
  HookContext,
  HookDefinition,
  HookMap,
  HookResult,
  HookType,
} from "../../domain/hook.js";
import { ProcessExecutor } from "../process/ProcessExecutor.js";
import { NodeProcessExecutor } from "../process/NodeProcessExecutor.js";

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_CHARS = 5_000;

/**
 * Runs each configured hook as a child process.
 *
 * The command receives the event on both channels so that hooks can be written
 * in any language: the context arrives as JSON on stdin, and the individual
 * fields arrive as CODEFORGE_* environment variables.
 *
 * Hooks for one event run in sequence rather than in parallel, because a hook
 * is allowed to touch the working tree and two of them racing over it would be
 * unpredictable.
 */
export class CommandHookDispatcher implements HookDispatcher {
  constructor(
    private readonly hooks: HookMap,
    private readonly cwd: string = process.cwd(),
    private readonly processExecutor: ProcessExecutor = new NodeProcessExecutor(),
    private reporter?: HookReporter,
  ) {}

  setReporter(reporter?: HookReporter): void {
    this.reporter = reporter;
  }

  getReporter(): HookReporter | undefined {
    return this.reporter;
  }

  async dispatch(context: HookContext): Promise<HookResult[]> {
    const definitions = this.hooks[context.event] ?? [];
    const results: HookResult[] = [];

    for (const definition of definitions) {
      results.push(await this.run(definition, context));
    }

    return results;
  }

  private async run(
    definition: HookDefinition,
    context: HookContext,
  ): Promise<HookResult> {
    const type: HookType = definition.type ?? "notify";
    const timeoutMs = definition.timeout ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    try {
      this.reporter?.onHookStart({
        event: context.event,
        definition,
        context,
        startedAt,
      });
    } catch {
      // Hook execution must never crash or be prevented if a HookReporter throws an exception.
    }

    let result: HookResult;
    try {
      const intentName = context.intentName;
      const processResult = await this.processExecutor.spawn(definition.run, [], {
        shell: true,
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
        env: {
          ...process.env,
          CODEFORGE_EVENT: context.event,
          CODEFORGE_INTENT: intentName,
          CODEFORGE_TASK_ID: context.taskId ?? "",
          CODEFORGE_CWD: this.cwd,
        },
        pipeStdinContent: JSON.stringify(context),
      });

      const rawOutput = [processResult.stdout, processResult.stderr]
        .filter((s) => s && s.length > 0)
        .join("\n");

      const output =
        rawOutput.length > MAX_OUTPUT_CHARS
          ? rawOutput.slice(-MAX_OUTPUT_CHARS)
          : rawOutput;

      result = {
        name: definition.name,
        type,
        ok: processResult.exitCode === 0,
        exitCode: processResult.exitCode,
        output: output.trim(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        name: definition.name,
        type,
        ok: false,
        exitCode: null,
        output: `Hook "${definition.name}" could not be started: ${message}`,
      };
    }

    const durationMs = Math.max(0, Date.now() - startedAt);
    try {
      this.reporter?.onHookEnd({
        event: context.event,
        definition,
        context,
        result,
        durationMs,
      });
    } catch {
      // Hook execution must never crash or be prevented if a HookReporter throws an exception.
    }

    return result;
  }
}
