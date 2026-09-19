export interface TaskContext {
    promptFilePath: string;
    intentName: string;    taskId?: string;
    model?: string;
    silent?: boolean;
    onLog?: (chunk: string) => void;
}

export interface AgentRunner {
    execute(context: TaskContext): Promise<void>;
    runTask?(context: TaskContext): Promise<void>;
    getAvailableAgents?(): Promise<string[]>;
}
