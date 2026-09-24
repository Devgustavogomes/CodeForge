import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { CodeForgeConfig, resolveAiReviewConfig, SupportedLanguage } from "../../config/types.js";
import { HOOK_EVENTS, HookDefinition, HookEvent, HookType } from "../../domain/hook.js";
import { IntentSourceFactory } from "../../infrastructure/intent-sources/IntentSourceFactory.js";
import { translate } from "../ui/i18n.js";
import { AppContainer, createAppContainer } from "../../infrastructure/container.js";

import { ActionResult } from "../types.js";

const labels = {
  en: { event: "Hook event", add: "Add hook", edit: "Edit", delete: "Delete", deleteQuestion: "Delete hook", command: "Command (run)", name: "Hook name", type: "Hook type", required: "Hook command is required.", provider: "Intent source provider", project: "Project (optional)", team: "Team (optional)", apiKey: "API key or environment variable (optional)" },
  pt: { event: "Evento do hook", add: "Adicionar hook", edit: "Editar", delete: "Excluir", deleteQuestion: "Excluir hook", command: "Comando (run)", name: "Nome do hook", type: "Tipo do hook", required: "O comando do hook é obrigatório.", provider: "Provedor de intent source", project: "Projeto (opcional)", team: "Time (opcional)", apiKey: "Chave de API ou variável de ambiente (opcional)" },
  es: { event: "Evento del hook", add: "Agregar hook", edit: "Editar", delete: "Eliminar", deleteQuestion: "Eliminar hook", command: "Comando (run)", name: "Nombre del hook", type: "Tipo del hook", required: "El comando del hook es obligatorio.", provider: "Proveedor de intent source", project: "Proyecto (opcional)", team: "Equipo (opcional)", apiKey: "Clave de API o variable de entorno (opcional)" },
} as const;

function deriveHookName(run: string): string {
  return run.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "hook";
}

async function configureHooks(config: CodeForgeConfig, lang: SupportedLanguage, save: () => void): Promise<void> {
  const label = labels[lang];
  while (true) {
    const event = await select({
      message: label.event,
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...HOOK_EVENTS.map((value) => ({ name: `${value} (${config.hooks?.[value]?.length ?? 0})`, value })),
      ],
    });
    if (event === "back") return;
    const hookEvent = event as HookEvent;

    while (true) {
      const hooks = config.hooks?.[hookEvent] ?? [];
      const action = await select({
        message: `${hookEvent} hooks`,
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          { name: label.add, value: "add" },
          ...hooks.flatMap((hook, index) => [
            { name: `${label.edit}: ${hook.name} (${hook.type ?? "notify"})`, value: `edit:${index}` },
            { name: `${label.delete}: ${hook.name}`, value: `delete:${index}` },
          ]),
        ],
      });
      if (action === "back") break;

      const [operation, indexText] = action.split(":");
      const index = Number(indexText);
      if (operation === "delete") {
        const confirmed = await select({
          message: `${label.deleteQuestion} ${hooks[index].name}?`,
          choices: [
            { name: translate("config_no", lang), value: "no" },
            { name: translate("config_yes", lang), value: "yes" },
          ],
        });
        if (confirmed !== "yes") continue;
        config.hooks = { ...config.hooks, [hookEvent]: hooks.filter((_, i) => i !== index) };
        save();
        continue;
      }

      const existing: HookDefinition | undefined = operation === "edit" ? hooks[index] : undefined;
      const run = (await input({ message: label.command, default: existing?.run })).trim();
      if (!run) {
        console.log(label.required);
        continue;
      }
      const name = (await input({ message: label.name, default: existing?.name ?? deriveHookName(run) })).trim();
      const type = await select({
        message: label.type,
        choices: [
          { name: "notify", value: "notify" },
          { name: "gate", value: "gate" },
        ],
        default: existing?.type ?? "notify",
      }) as HookType;
      const hook: HookDefinition = { name: name || deriveHookName(run), run, type };
      if (existing?.timeout !== undefined) hook.timeout = existing.timeout;
      const updated = [...hooks];
      if (existing) updated[index] = hook;
      else updated.push(hook);
      config.hooks = { ...config.hooks, [hookEvent]: updated };
      save();
    }
  }
}

async function configureIntentSource(config: CodeForgeConfig, lang: SupportedLanguage, rawSource = config.intentSource): Promise<boolean> {
  const label = labels[lang];
  const provider = await select({
    message: label.provider,
    choices: [
      { name: translate("menu_back", lang), value: "back" },
      ...IntentSourceFactory.getAvailableProviders().map((value) => ({ name: value, value })),
    ],
    default: config.intentSource?.provider ?? "filesystem",
  });
  if (provider === "back") return false;
  const current = rawSource?.provider === provider ? rawSource : undefined;
  const project = (await input({ message: label.project, default: current?.project ?? "" })).trim();
  const team = (await input({ message: label.team, default: current?.team ?? "" })).trim();
  const apiKey = (await input({
    message: label.apiKey,
    default: current?.apiKey ?? IntentSourceFactory.getDefaultApiKey(provider),
  })).trim();
  config.intentSource = {
    provider,
    ...(project ? { project } : {}),
    ...(team ? { team } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
  return true;
}

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
        { name: "hooks", value: "hooks" },
        { name: "intentSource", value: "intentSource" },
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
          },
          hooks: async (c) => {
            await configureHooks(c, lang, () => envUseCase.saveConfig(c));
            return false;
          },
          intentSource: async (c) => configureIntentSource(
            c,
            lang,
            container.configService?.loadConfig({ interpolate: false })?.intentSource ?? c.intentSource,
          ),
        };

        if (handlers[key]) {
          const updated = await handlers[key](config);
          if (updated) {
            envUseCase.saveConfig(config);
            const value = key === "intentSource"
              ? config.intentSource?.provider ?? "filesystem"
              : String(config[key as keyof CodeForgeConfig]);
            console.log(translate("config_updated", lang, { key, value }));
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
