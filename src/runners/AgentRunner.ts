export interface TaskContext {
    promptFilePath: string;
    specName: string;
    taskId: string;
}

export interface AgentRunner {
    execute(context: TaskContext): Promise<void>;
}
