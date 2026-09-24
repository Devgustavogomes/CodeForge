import { confirm, select } from "@inquirer/prompts";
import { AppContainer } from "../../infrastructure/container.js";
import { SupportedLanguage } from "../../config/types.js";
import { translate, TranslationKey } from "../ui/i18n.js";
import { ActionResult } from "../types.js";

export function isPromptCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

export function handlePromptCancellation(lang: SupportedLanguage = "en"): ActionResult {
  console.log(translate("delete_cancelled", lang));
  return { back: true };
}

export interface PromptSelectIntentOptions {
  messageKey?: TranslationKey;
  defaultMessage?: string;
  emptyErrorKey?: TranslationKey;
}

/**
 * Prompts the user to select an existing intent from the container.
 * Returns the selected intent name, null if user chose 'back', or undefined if no intents exist.
 */
export async function promptSelectIntent(
  container: AppContainer,
  lang: SupportedLanguage = "en",
  options: PromptSelectIntentOptions = {},
): Promise<string | null | undefined> {
  const listUseCase = container.listIntentsUseCase;
  const intents = listUseCase.execute();

  if (intents.length === 0) {
    const errorKey = options.emptyErrorKey ?? "err_no_intents";
    console.error(translate(errorKey, lang));
    process.exitCode = 1;
    return undefined;
  }

  const message = options.messageKey
    ? translate(options.messageKey, lang)
    : (options.defaultMessage ?? translate("run_select_intent", lang));

  const selected = await select({
    message,
    choices: [
      { name: translate("menu_back", lang), value: "back" },
      ...intents.map((item) => ({ name: item.name, value: item.name })),
    ],
  });

  if (selected === "back") {
    return null;
  }

  return selected;
}

export interface PromptSelectTaskOptions {
  message?: string;
  formatChoice?: (task: { id: string; title: string }) => string;
}

/**
 * Prompts the user to select an available task belonging to a specific intent.
 * Returns the selected taskId, null if user chose 'back', or undefined if error/no tasks.
 */
export async function promptSelectTask(
  container: AppContainer,
  intentName: string,
  lang: SupportedLanguage = "en",
  options: PromptSelectTaskOptions = {},
): Promise<string | null | undefined> {
  const tasksResult = container.taskOperationsUseCase.getAvailableTasks(intentName);

  if (tasksResult.kind === "intent-not-found") {
    console.error(
      translate("err_tasks_dir_not_found", lang, { intent: intentName }),
    );
    process.exitCode = 1;
    return undefined;
  }

  if (tasksResult.kind !== "tasks" || tasksResult.tasks.length === 0) {
    console.error(
      translate("task_delete_no_tasks", lang, { intent: intentName }),
    );
    process.exitCode = 1;
    return undefined;
  }

  const message = options.message ?? `Select a task from '${intentName}':`;
  const formatChoice =
    options.formatChoice ?? ((t) => `${t.id} - ${t.title}`);

  const selected = await select({
    message,
    choices: [
      { name: translate("menu_back", lang), value: "back" },
      ...tasksResult.tasks.map((t) => ({
        name: formatChoice(t),
        value: t.id,
      })),
    ],
  });

  if (selected === "back") {
    return null;
  }

  return selected;
}

/**
 * Prompts user confirmation with cancel logging support.
 * Returns true if confirmed, false if declined.
 */
export async function promptConfirmAction(
  message: string,
  lang: SupportedLanguage = "en",
  defaultValue: boolean = false,
): Promise<boolean> {
  const confirmed = await confirm({
    message,
    default: defaultValue,
  });

  if (!confirmed) {
    console.log(translate("delete_cancelled", lang));
    return false;
  }

  return true;
}
