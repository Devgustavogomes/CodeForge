import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ValidatePlanUseCase } from "./ValidatePlanUseCase.js";
import { buildPlanningFixPrompt, buildPlanningPrompt } from "../../infrastructure/assets/prompts/planning.js";
import { CodeForgeConfig } from "../../config/types.js";

export type GeneratePlanResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "tasks-dir-not-found" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "valid"; autoRun?: boolean };

export class GeneratePlanUseCase {
  private validateUseCase: ValidatePlanUseCase;

  constructor(
    private readonly workspace: WorkspaceGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig,
  ) {
    this.validateUseCase = new ValidatePlanUseCase(this.workspace);
  }

  async execute(intentName: string, model: string): Promise<GeneratePlanResult> {
    if (!this.workspace.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const intentPath = PATHS.intentFile(intentName);
    if (!this.workspace.exists(intentPath)) {
      return { kind: "intent-not-found" };
    }

    let rulesContent = "";
    if (this.workspace.exists(PATHS.planningRules)) {
      rulesContent = this.workspace.readFile(PATHS.planningRules);
    }

    const intentContent = this.workspace.readFile(intentPath);

    const intentTasksDir = `${PATHS.tasksDir}/${intentName}`;
    if (!this.workspace.exists(intentTasksDir)) {
      this.workspace.mkdir(intentTasksDir);
    }

    const prompt = buildPlanningPrompt(intentName, intentContent, rulesContent, intentTasksDir, this.config.language);

    const plansDir = PATHS.plansDir;
    if (!this.workspace.exists(plansDir)) {
      this.workspace.mkdir(plansDir);
    }
    const promptPath = `${plansDir}/${intentName}.temp.prompt.md`;
    this.workspace.writeFile(promptPath, prompt);

    const context: TaskContext = {
      promptFilePath: promptPath,
      intentName,      model: model,
      silent: true,
    };

    try {
      await this.runner.execute(context);
      let valResult = this.validateUseCase.execute(intentName);

      if (valResult.kind === "invalid") {
        const fixPrompt = buildPlanningFixPrompt(intentName, valResult.errors, this.config.language);
        this.workspace.writeFile(promptPath, fixPrompt);

        await this.runner.execute(context);
        valResult = this.validateUseCase.execute(intentName);
      }

      if (valResult.kind === "intent-not-found") {
        return { kind: "tasks-dir-not-found" };
      }

      return valResult as GeneratePlanResult;
    } finally {
      if (this.workspace.exists(promptPath)) {
        this.workspace.deleteFile(promptPath);
      }
    }
  }
}
