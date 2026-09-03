import { spawn } from "child_process";
import { HookDispatcher } from "../../application/ports/HookDispatcher.js";
import {
  HookContext,
  HookDefinition,
  HookMap,
  HookResult,
  HookType,
} from "../../domain/hook.js";

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
  ) {}

  async dispatch(context: HookContext): Promise<HookResult[]> {
    const definitions = this.hooks[context.event] ?? [];
    const results: HookResult[] = [];

    for (const definition of definitions) {
      results.push(await this.run(definition, context));
    }

    return results;
  }

  private run(
    definition: HookDefinition,
    context: HookContext,
  ): Promise<HookResult> {
    const type: HookType = definition.type ?? "notify";
    const timeoutMs = definition.timeout ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve) => {
      const child = spawn(definition.run, {
        shell: true,
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          CODEFORGE_EVENT: context.event,
          CODEFORGE_SPEC: context.specName,
          CODEFORGE_TASK_ID: context.taskId ?? "",
          CODEFORGE_CWD: this.cwd,
        },
      });

      let output = "";
      let settled = false;

      const settle = (exitCode: number | null, extra?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        resolve({
          name: definition.name,
          type,
          ok: exitCode === 0,
          exitCode,
          output: (extra ? `${output}\n${extra}` : output).trim(),
        });
      };

      const collect = (data: Buffer | string): void => {
        output += data.toString();
        if (output.length > MAX_OUTPUT_CHARS) {
          output = output.slice(-MAX_OUTPUT_CHARS);
        }
      };

      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);

      child.on("error", (error) => {
        settle(null, `Hook "${definition.name}" could not be started: ${error.message}`);
      });

      child.on("close", (exitCode) => {
        settle(exitCode);
      });

      const timer = setTimeout(() => {
        child.kill();
        settle(null, `Hook "${definition.name}" timed out after ${timeoutMs}ms.`);
      }, timeoutMs);

      if (child.stdin) {
        // A hook is free to ignore stdin and exit before we finish writing.
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(context));
      }
    });
  }
}
