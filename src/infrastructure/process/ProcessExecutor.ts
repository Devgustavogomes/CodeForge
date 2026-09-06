export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ProcessExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  shell?: boolean | string;
}

export interface ProcessSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  stdio?: unknown;
  shell?: boolean | string;
  pipeStdinContent?: string;
  pipePromptFile?: string;
}

export interface ProcessExecutor {
  exec(command: string, options?: ProcessExecOptions): Promise<ProcessOutput>;
  spawn(command: string, args: string[], options?: ProcessSpawnOptions): Promise<ProcessOutput>;
}
