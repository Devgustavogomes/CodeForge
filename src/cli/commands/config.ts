import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { ConfigService } from "../../config/ConfigService.js";
import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { CodeForgeConfig, SupportedLanguage } from "../../config/types.js";
import { getEnvironmentChoices, getAgentChoices } from "../../application/config-options.js";
import { translate } from "../ui/i18n.js";

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Interactively update CodeForge configuration")
    .action(async () => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      const configService = new ConfigService(gw);
      const config = configService.loadConfig();

      const lang = config?.language || "en";

      if (!config) {
        console.error("CodeForge is not initialized. Run 'codeforge init' first.");
        process.exit(1);
      }

      while (true) {
        const key = await select({
          message: translate("config_select_key", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            { name: "language", value: "language" },
            { name: "environment", value: "environment" },
            { name: "plannerAgent", value: "plannerAgent" },
            { name: "executorAgent", value: "executorAgent" },
          ],
        });

        if (key === "back") {
          if (process.env.CODEFORGE_INTERACTIVE) {
            process.exit(200);
          } else {
            process.exit(0);
          }
        }

        const handlers: Record<string, (config: CodeForgeConfig) => Promise<boolean>> = {
          language: async (c) => {
            const selectedLang = await select({
              message: translate("config_select_lang", lang),
              choices: [
                { name: "English (en)", value: "en" },
                { name: "Português (pt)", value: "pt" },
                { name: "Español (es)", value: "es" },
                { name: translate("menu_back", lang), value: "back" },
              ],
            });
            if (selectedLang === "back") return false;
            c.language = selectedLang as SupportedLanguage;
            return true;
          },
          environment: async (c) => {
            const envChoices = await getEnvironmentChoices();
            const val = await select({
              message: translate("config_select_env", lang),
              choices: [...envChoices, { name: translate("menu_back", lang), value: "back" }],
            });
            if (val === "back") return false;
            c.environment = val;
            await handlers.plannerAgent(c);
            await handlers.executorAgent(c);
            return true;
          },
          plannerAgent: async (c) => {
            const agentChoices = await getAgentChoices(c.environment);
            if (agentChoices.length > 0) {
              const val = await select({
                message: translate("config_select_planner", lang),
                choices: [...agentChoices, { name: translate("menu_back", lang), value: "back" }],
              });
              if (val === "back") return false;
              c.plannerAgent = val;
            } else {
              console.log(translate("config_no_agents", lang, { env: c.environment }));
              const val = await input({
                message: translate("config_enter_planner", lang),
                default: c.plannerAgent,
              });
              if (!val) return false;
              c.plannerAgent = val;
            }
            return true;
          },
          executorAgent: async (c) => {
            const agentChoices = await getAgentChoices(c.environment);
            if (agentChoices.length > 0) {
              const val = await select({
                message: translate("config_select_executor", lang),
                choices: [...agentChoices, { name: translate("menu_back", lang), value: "back" }],
              });
              if (val === "back") return false;
              c.executorAgent = val;
            } else {
              console.log(translate("config_no_agents", lang, { env: c.environment }));
              const val = await input({
                message: translate("config_enter_executor", lang),
                default: c.executorAgent,
              });
              if (!val) return false;
              c.executorAgent = val;
            }
            return true;
          }
        };

        if (handlers[key]) {
          const updated = await handlers[key](config);
          if (updated) {
            configService.saveConfig(config);
            console.log(translate("config_updated", lang, { key, value: String(config[key as keyof CodeForgeConfig]) }));
          }
        }
      }
    });
}
