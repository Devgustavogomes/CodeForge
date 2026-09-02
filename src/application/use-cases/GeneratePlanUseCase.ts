import fs from "node:fs";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { preparePlanningPrompt } from "../plan.js";
import { validatePlan } from "../validate.js";
import { buildPlanningFixPrompt } from "../../prompts/planning.js";
import { CodeForgeConfig } from "../../config/types.js";

export type GeneratePlanResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "tasks-dir-not-found" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "valid"; autoRun?: boolean };

export class GeneratePlanUseCase {
  constructor(
    private readonly workspace: WorkspaceGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig,
  ) {}

  async execute(specName: string, model: string): Promise<GeneratePlanResult> {
    const result = preparePlanningPrompt(this.workspace, specName, this.config.language);

    if (result.kind === "not-initialized") {
      return { kind: "not-initialized" };
    }
    if (result.kind === "spec-not-found") {
      return { kind: "spec-not-found" };
    }

    const plansDir = ".codeforge/plans";
    if (!this.workspace.exists(plansDir)) {
      this.workspace.mkdir(plansDir);
    }
    const promptPath = `${plansDir}/${specName}.temp.prompt.md`;
    this.workspace.writeFile(promptPath, result.prompt);

    const context: TaskContext = {
      promptFilePath: promptPath,
      specName: specName,
      model: model,
      silent: true,
    };

    try {
      await this.runner.execute(context);
      let valResult = validatePlan(this.workspace, specName);

      if (valResult.kind === "invalid") {
        const fixPrompt = buildPlanningFixPrompt(specName, valResult.errors, this.config.language);
        this.workspace.writeFile(promptPath, fixPrompt);
        
        await this.runner.execute(context);
        valResult = validatePlan(this.workspace, specName);
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
