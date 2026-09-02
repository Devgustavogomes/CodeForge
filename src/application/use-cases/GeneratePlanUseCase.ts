import fs from "node:fs";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { PATHS } from "../../infrastructure/paths.js";
import { ValidatePlanUseCase } from "./ValidatePlanUseCase.js";
import { buildPlanningFixPrompt, buildPlanningPrompt } from "../../infrastructure/assets/prompts/planning.js";
import { CodeForgeConfig } from "../../config/types.js";

export type GeneratePlanResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
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

  async execute(specName: string, model: string): Promise<GeneratePlanResult> {
    if (!this.workspace.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const specPath = PATHS.specFile(specName);
    if (!this.workspace.exists(specPath)) {
      return { kind: "spec-not-found" };
    }

    let rulesContent = "";
    if (this.workspace.exists(PATHS.planningRules)) {
      rulesContent = this.workspace.readFile(PATHS.planningRules);
    }

    const specContent = this.workspace.readFile(specPath);

    const specTasksDir = `${PATHS.tasksDir}/${specName}`;
    if (!this.workspace.exists(specTasksDir)) {
      this.workspace.mkdir(specTasksDir);
    }

    const prompt = buildPlanningPrompt(specName, specContent, rulesContent, specTasksDir, this.config.language);

    const plansDir = ".codeforge/plans";
    if (!this.workspace.exists(plansDir)) {
      this.workspace.mkdir(plansDir);
    }
    const promptPath = `${plansDir}/${specName}.temp.prompt.md`;
    this.workspace.writeFile(promptPath, prompt);

    const context: TaskContext = {
      promptFilePath: promptPath,
      specName: specName,
      model: model,
      silent: true,
    };

    try {
      await this.runner.execute(context);
      let valResult = this.validateUseCase.execute(specName);

      if (valResult.kind === "invalid") {
        const fixPrompt = buildPlanningFixPrompt(specName, valResult.errors, this.config.language);
        this.workspace.writeFile(promptPath, fixPrompt);
        
        await this.runner.execute(context);
        valResult = this.validateUseCase.execute(specName);
      }

      if (valResult.kind === "spec-not-found") {
        return { kind: "tasks-dir-not-found" };
      }

      return valResult as GeneratePlanResult;
    } finally {
      if (fs.existsSync(promptPath)) {
        fs.unlinkSync(promptPath);
      }
    }
  }
}
