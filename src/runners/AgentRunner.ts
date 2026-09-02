export interface TaskContext {
    promptFilePath: string;
    specName: string;
    taskId?: string;
    model?: string;
    silent?: boolean;
}

export interface AgentRunner {
    execute(context: TaskContext): Promise<void>;
    getAvailableAgents?(): Promise<string[]>;
}
