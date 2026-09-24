import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { CodeForgeConfig, resolveAiReviewConfig, SupportedLanguage } from "../../config/types.js";
import { translate } from "../ui/i18n.js";
import { AppContainer, createAppContainer } from "../../infrastructure/container.js";

import { ActionResult } from "../types.js";

export async function configAction(
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const envUseCase = container.configureEnvironmentUseCase;
  const config = envUseCase.loadConfig();

  const lang = config?.language || "en";

  if (!config) {
    console.error("CodeForge is not initialized. Run 'codeforge init' first.");
    process.exitCode = 1;
    return { success: false };
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
        { name: "aiReview", value: "aiReview" },
      ],
    });

    if (key === "back") {
      return { back: true };
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
            const envChoices = envUseCase.getAvailableEnvironments().map((env) => ({ name: env, value: env }));
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
            const agents = await envUseCase.getAgentsForEnvironment(c.environment);
            const agentChoices = agents.map((agent) => ({ name: agent, value: agent }));
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
            const agents = await envUseCase.getAgentsForEnvironment(c.environment);
            const agentChoices = agents.map((agent) => ({ name: agent, value: agent }));
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
          },
          aiReview: async (c) => {
            const review = resolveAiReviewConfig(c.aiReview);
            const enabled = await select({
              message: translate("config_ai_review_enabled", lang),
              choices: [
                { name: translate("config_yes", lang), value: "enabled" },
                { name: translate("config_no", lang), value: "disabled" },
                { name: translate("menu_back", lang), value: "back" },
              ],
            });
            if (enabled === "back") return false;

            if (enabled === "disabled") {
              c.aiReview = { ...review, enabled: false };
              return true;
            }

            const agents = await envUseCase.getAgentsForEnvironment(c.environment);
            if (agents.length === 0) {
              console.log(translate("config_no_agents", lang, { env: c.environment }));
              return false;
            }
            const agent = await select({
              message: translate("config_select_reviewer", lang),
              choices: [
                ...agents.map((value) => ({ name: value, value })),
                { name: translate("menu_back", lang), value: "back" },
              ],
            });
            if (agent === "back") return false;

            let maxRounds: number | undefined;
            while (maxRounds === undefined) {
              const value = await input({
                message: translate("config_enter_review_rounds", lang),
                default: String(review.maxRounds),
              });
              const parsed = Number(value);
              if (Number.isInteger(parsed) && parsed > 0) {
                maxRounds = parsed;
              } else {
                console.log(translate("config_invalid_review_rounds", lang));
              }
            }
            c.aiReview = { enabled: true, agent, maxRounds };
            return true;
          }
        };

        if (handlers[key]) {
          const updated = await handlers[key](config);
          if (updated) {
            envUseCase.saveConfig(config);
            console.log(translate("config_updated", lang, { key, value: String(config[key as keyof CodeForgeConfig]) }));
          }
        }
      }
}

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Interactively update CodeForge configuration")
    .action(async () => {
      await configAction();
    });
}
