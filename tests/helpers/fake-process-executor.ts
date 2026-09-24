import {
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

  async exec(command: string, options?: ProcessExecOptions): Promise<ProcessOutput> {
    this.calls.push({ type: "exec", command, options });
    return this.resolveCommand(command, undefined, options);
  }

  async spawn(command: string, args: string[], options?: ProcessSpawnOptions): Promise<ProcessOutput> {
    this.calls.push({ type: "spawn", command, args: [...args], options });
    return this.resolveCommand(command, args, options);
  }
}
