export interface ProcessIdentity {
  pid: number;
  parentPid: number;
  /** OS creation identity, never just a PID or a launch wall-clock timestamp. */
  birth: string;
  token?: string;
}

export interface ProcessRecord {
  id: string;
  host: string;
  bootId?: string;
  platform: string;
  token: string;
  command: string;
  args: string[];
  cwd: string;
  intentName?: string;
  taskId?: string;
  kind?: "preparation" | "agent" | "hook" | "conflict-resolution";
  startedAt: string;
  status: "launching" | "running" | "exited" | "launch-failed" | "interrupted";
  pid?: number;
  identities: ProcessIdentity[];
  endedAt?: string;
  exitCode?: number | null;
  diagnostics: string[];
}

export interface ProcessInspection {
  status: "active" | "interrupted" | "unknown";
  safeToReuse: boolean;
  processes: ProcessIdentity[];
  diagnostics: string[];
}

export interface ProcessTrackingOptions {
  intentName?: string;
  taskId?: string;
  kind?: ProcessRecord["kind"];
  /** Synchronous persistence, invoked before launch and for identity/exit updates. Throws fail visibly. */
  onProcessRecord?: (record: ProcessRecord) => void;
}

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  process?: ProcessRecord;
}

export interface ProcessExecOptions extends ProcessTrackingOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  shell?: boolean | string;
}

export interface ProcessSpawnOptions extends ProcessExecOptions {
  stdio?: unknown;
  pipeStdinContent?: string;
  pipePromptFile?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ProcessExecutor {
  exec(command: string, options?: ProcessExecOptions): Promise<ProcessOutput>;
  spawn(command: string, args: string[], options?: ProcessSpawnOptions): Promise<ProcessOutput>;
  inspect(record: ProcessRecord): Promise<ProcessInspection>;
}
