import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { IntentSourceFactory } from "../../../infrastructure/intent-sources/IntentSourceFactory.js";
import { PullIntentUseCase } from "../../../application/use-cases/PullIntentUseCase.js";
import { translate } from "../../ui/i18n.js";
import { IntentReference, IntentSourceConfig } from "../../../domain/intent-source.js";
import { IntentSource } from "../../../application/ports/IntentSource.js";
import { ActionResult } from "../../types.js";
import { isPromptCancellation } from "../../common/prompts.js";

export async function intentPullAction(
  id?: string,
  options?: { source?: string; name?: string },
  container: AppContainer = createAppContainer()
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  const configIntentSource = config?.intentSource;
  const provider = (options?.source || configIntentSource?.provider || "filesystem").toLowerCase();

  // If provider is filesystem without [id], display informational message
  if (!id && provider === "filesystem") {
    console.log(translate("intent_pull_filesystem_notice", lang));
    return { success: true };
  }

  const intentSourceConfig: IntentSourceConfig = {
    ...configIntentSource,
    provider,
  };

  let intentSource: IntentSource;
  try {
    intentSource = (container.intentSourceFactory ?? IntentSourceFactory).create(provider, intentSourceConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(translate("intent_pull_failed", lang, { error: message }));
    process.exitCode = 1;
    return { success: false };
  }

  let selectedId = id;

  try {
    if (!selectedId) {
      let items: IntentReference[] = [];
      try {
        items = await intentSource.list();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(translate("intent_pull_failed", lang, { error: message }));
        process.exitCode = 1;
        return { success: false };
      }

      if (items && items.length > 0) {
        const MANUAL_OPTION = "__manual__";
        const selected = await select({
          message: translate("intent_pull_select_item", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            ...items.map((item) => ({
              name: `${item.id} - ${item.title}`,
              value: item.id,
            })),
            {
              name: translate("intent_pull_manual_input_option", lang),
              value: MANUAL_OPTION,
            },
          ],
        });

        if (selected === "back") {
          return { back: true };
        }

        if (selected === MANUAL_OPTION) {
          selectedId = await input({
            message: translate("intent_pull_enter_id", lang),
            validate: (val) => val.trim().length > 0 || "ID is required",
          });
        } else {
          selectedId = selected;
        }
      } else {
        selectedId = await input({
          message: translate("intent_pull_enter_id", lang),
          validate: (val) => val.trim().length > 0 || "ID is required",
        });
      }
    }

    selectedId = selectedId?.trim();
    if (!selectedId) {
      return { success: false };
    }

    console.log(
      translate("intent_pull_fetching", lang, {
        id: selectedId,
        source: intentSource.name,
      })
    );

    const useCase = container.pullIntentUseCase ?? new PullIntentUseCase(container.gw, intentSource);
    const result = await useCase.execute({
      id: selectedId,
      customName: options?.name,
      intentSource,
    });

    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "fetch-failed":
      case "error":
        console.error(
          translate("intent_pull_failed", lang, { error: result.error })
        );
        process.exitCode = 1;
        return { success: false };
      case "success":
        console.log(
          translate("intent_pull_success", lang, {
            id: result.intent.id,
            path: result.filePath,
            intent: result.intent.id,
          })
        );
        return { success: true };
    }
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return { back: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(translate("intent_pull_failed", lang, { error: message }));
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerIntentPullCommand(intent: Command): void {
  intent
    .command("pull [id]")
    .description("Pull an intent from an external source or issue tracker")
    .option("-s, --source <provider>", "Intent source provider (e.g. linear, github, clickup, filesystem)")
    .option("-n, --name <slug>", "Custom filename for the local intent file")
    .action(async (id?: string, options?: { source?: string; name?: string }) => {
      await intentPullAction(id, options);
    });
}
