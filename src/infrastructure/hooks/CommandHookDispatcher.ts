import { HookDispatcher } from "../../application/ports/HookDispatcher.js";
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
  ) {}

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

    try {
      const result = await this.processExecutor.spawn(definition.run, [], {
        shell: true,
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
        env: {
          ...process.env,
          CODEFORGE_EVENT: context.event,
          CODEFORGE_SPEC: context.specName,
          CODEFORGE_TASK_ID: context.taskId ?? "",
          CODEFORGE_CWD: this.cwd,
        },
        pipeStdinContent: JSON.stringify(context),
      });

      const rawOutput = [result.stdout, result.stderr]
        .filter((s) => s && s.length > 0)
        .join("\n");

      const output =
        rawOutput.length > MAX_OUTPUT_CHARS
          ? rawOutput.slice(-MAX_OUTPUT_CHARS)
          : rawOutput;

      return {
        name: definition.name,
        type,
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        output: output.trim(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: definition.name,
        type,
        ok: false,
        exitCode: null,
        output: `Hook "${definition.name}" could not be started: ${message}`,
      };
    }
  }
}
