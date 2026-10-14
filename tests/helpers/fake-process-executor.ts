import { randomUUID } from "node:crypto";
import os from "node:os";
import {
  ProcessInspection,
  ProcessRecord,
  ProcessOutput,
  ProcessExecOptions,
  ProcessSpawnOptions,
  ProcessExecutor,
} from "../../src/infrastructure/process/ProcessExecutor.js";

export type { ProcessOutput, ProcessExecOptions, ProcessSpawnOptions, ProcessExecutor };

export interface ExecutedCommand {
  type: "exec" | "spawn";
  command: string;
  args?: string[];
  options?: ProcessExecOptions | ProcessSpawnOptions;
}

export type CommandMatcher = string | RegExp;

export type CommandHandler = (
  command: string,
  args?: string[],
  options?: ProcessExecOptions | ProcessSpawnOptions
) => ProcessOutput | Promise<ProcessOutput>;

export class FakeProcessExecutor implements ProcessExecutor {
  public records: ProcessRecord[] = [];
  public inspections: ProcessRecord[] = [];
  public inspection: ProcessInspection = { status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] };
  async inspect(record: ProcessRecord): Promise<ProcessInspection> {
    this.inspections.push(structuredClone(record));
    return structuredClone(this.inspection);
  }

  public readonly calls: ExecutedCommand[] = [];
  private handlers: Array<{ matcher: CommandMatcher; handler: CommandHandler }> = [];
  private defaultResponse: ProcessOutput = {
    stdout: "",
    stderr: "",
    exitCode: 0,
  };
  private defaultHandler?: CommandHandler;

  get executedCommands(): ExecutedCommand[] {
    return this.calls;
  }

  get execCalls(): Array<{ command: string; options?: ProcessExecOptions }> {
    return this.calls
      .filter((c): c is ExecutedCommand & { type: "exec" } => c.type === "exec")
      .map((c) => ({ command: c.command, options: c.options as ProcessExecOptions }));
  }

  get spawnCalls(): Array<{ command: string; args: string[]; options?: ProcessSpawnOptions }> {
    return this.calls
      .filter((c): c is ExecutedCommand & { type: "spawn"; args: string[] } => c.type === "spawn")
      .map((c) => ({ command: c.command, args: c.args ?? [], options: c.options as ProcessSpawnOptions }));
  }

  hasExecuted(matcher: CommandMatcher): boolean {
    return this.calls.some((call) => {
      const full = call.args && call.args.length > 0 ? `${call.command} ${call.args.join(" ")}` : call.command;
      if (typeof matcher === "string") {
        return call.command === matcher || full === matcher || call.command.includes(matcher) || full.includes(matcher);
      }
      return matcher.test(call.command) || matcher.test(full);
    });
  }

  reset(): void {
    this.calls.length = 0;
    this.inspections = [];
    this.records = [];
    this.inspection = { status: "interrupted", safeToReuse: true, processes: [], diagnostics: [] };
    this.handlers = [];
    this.defaultHandler = undefined;
    this.defaultResponse = { stdout: "", stderr: "", exitCode: 0 };
  }

  setDefaultResponse(response: Partial<ProcessOutput>): this {
    this.defaultResponse = {
      stdout: "",
      stderr: "",
      exitCode: 0,
      ...response,
    };
    return this;
  }

  setDefaultHandler(handler: CommandHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  registerResponse(matcher: CommandMatcher, response: Partial<ProcessOutput>): this {
    const fullResponse: ProcessOutput = {
      stdout: "",
      stderr: "",
      exitCode: 0,
      ...response,
    };
    this.handlers.push({
      matcher,
      handler: () => fullResponse,
    });
    return this;
  }

  registerHandler(matcher: CommandMatcher, handler: CommandHandler): this {
    this.handlers.push({ matcher, handler });
    return this;
  }

  private matches(matcher: CommandMatcher, command: string, fullCommand: string): boolean {
    if (typeof matcher === "string") {
      return command === matcher || fullCommand === matcher || command.includes(matcher) || fullCommand.includes(matcher);
    }
    return matcher.test(command) || matcher.test(fullCommand);
  }

  private async resolveCommand(
    command: string,
    args?: string[],
    options?: ProcessExecOptions | ProcessSpawnOptions
  ): Promise<ProcessOutput> {
    const fullCommand = args && args.length > 0 ? `${command} ${args.join(" ")}` : command;

    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const { matcher, handler } = this.handlers[i];
      if (this.matches(matcher, command, fullCommand)) {
        return await handler(command, args, options);
      }
    }

    if (this.defaultHandler) {
      return await this.defaultHandler(command, args, options);
    }

    return { ...this.defaultResponse };
  }

  private async trackedCommand(command: string, args: string[] | undefined,
    options?: ProcessExecOptions | ProcessSpawnOptions): Promise<ProcessOutput> {
    if (!options?.onProcessRecord) return this.resolveCommand(command, args, options);
    const record: ProcessRecord = {
      id: randomUUID(), token: randomUUID(), host: os.hostname(), platform: process.platform,
      command, args: args ?? [], cwd: options.cwd ?? process.cwd(),
      intentName: options.intentName, taskId: options.taskId, kind: options.kind,
      startedAt: new Date().toISOString(), status: "launching", identities: [], diagnostics: [],
    };
    const report = () => {
      this.records.push(structuredClone(record));
      options.onProcessRecord!(structuredClone(record));
    };
    report(); record.status = "running"; report();
    try {
      const result = await this.resolveCommand(command, args, options);
      record.status = "exited"; record.exitCode = result.exitCode;
      record.endedAt = new Date().toISOString(); report(); return result;
    } catch (error) {
      record.status = "launch-failed"; record.endedAt = new Date().toISOString();
      record.diagnostics.push(String(error)); report(); throw error;
    }
  }

  async exec(command: string, options?: ProcessExecOptions): Promise<ProcessOutput> {
    this.calls.push({ type: "exec", command, options });
    return this.trackedCommand(command, undefined, options);
  }

  async spawn(command: string, args: string[], options?: ProcessSpawnOptions): Promise<ProcessOutput> {
    this.calls.push({ type: "spawn", command, args: [...args], options });
    return this.trackedCommand(command, args, options);
  }
}
