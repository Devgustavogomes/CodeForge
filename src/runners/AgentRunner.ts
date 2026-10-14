import type { ProcessTrackingOptions } from "../infrastructure/process/ProcessExecutor.js";

export interface TaskContext extends ProcessTrackingOptions {
    /** Directory in which the agent executes and relative prompt paths resolve. */
    cwd: string;
    promptFilePath: string;
    intentName: string;    taskId?: string;
    model?: string;
    silent?: boolean;
    quietTerminal?: boolean;
    onLog?: (chunk: string) => void;
}

export interface AgentRunner {
    execute(context: TaskContext): Promise<void>;
    runTask?(context: TaskContext): Promise<void>;
    getAvailableAgents?(): Promise<string[]>;
}
