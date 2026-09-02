import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { InitializeWorkspaceUseCase } from "../../application/use-cases/InitializeWorkspaceUseCase.js";
import { ConfigureEnvironmentUseCase } from "../../application/use-cases/ConfigureEnvironmentUseCase.js";
import { select, input } from "@inquirer/prompts";
import { translate } from "../ui/i18n.js";
import { ConfigService } from "../../config/ConfigService.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeForge in the current project")
    .action(async () => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      
      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";

      const useCase = new InitializeWorkspaceUseCase(gw);
      const result = useCase.execute();

      switch (result.kind) {
        case "already-initialized":
          console.log(translate("init_already_initialized", lang));
          console.log(translate("init_continue_config", lang));
          break;
        case "created":
          console.log(translate("init_success", lang));
          console.log(translate("init_created", lang));
          for (const item of result.created) {
            console.log(`  ${item}`);
          }
          console.log("");
          break;
      }

      const envUseCase = new ConfigureEnvironmentUseCase(gw);
      const environments = envUseCase.getAvailableEnvironments();
      const environment = await select({
        message: translate("init_select_env", lang),
        choices: environments.map((env) => ({ name: env, value: env })),
      });

      console.log(translate("init_introspecting", lang, { environment }));
      const availableAgents = await envUseCase.getAgentsForEnvironment(environment);

      let plannerAgent: string;
      let executorAgent: string;

      if (availableAgents.length > 0) {
        plannerAgent = await select({
          message: translate("init_select_planner", lang),
          choices: availableAgents.map((agent) => ({
            name: agent,
            value: agent,
          })),
        });
        executorAgent = await select({
          message: translate("init_select_executor", lang),
          choices: availableAgents.map((agent) => ({
            name: agent,
            value: agent,
          })),
        });
      } else {
        plannerAgent = await input({
          message: translate("init_enter_planner", lang),
          default: "default",
        });
        executorAgent = await input({
          message: translate("init_enter_executor", lang),
          default: "default",
        });
      }

      envUseCase.saveConfig({ environment, plannerAgent, executorAgent, language: lang });

      console.log(translate("init_config_saved", lang));

    });
}
