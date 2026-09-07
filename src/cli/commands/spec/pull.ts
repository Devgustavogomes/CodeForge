import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { SpecSourceFactory } from "../../../infrastructure/spec-sources/SpecSourceFactory.js";
import { PullSpecUseCase } from "../../../application/use-cases/PullSpecUseCase.js";
import { translate } from "../../ui/i18n.js";
import { SpecReference, SpecSourceConfig } from "../../../domain/spec-source.js";
import { SpecSource } from "../../../application/ports/SpecSource.js";

import { ActionResult } from "../../types.js";

export async function specPullAction(
  id?: string,
  options?: { source?: string; name?: string }
): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  const configSpecSource = config?.specSource;
  const provider = (options?.source || configSpecSource?.provider || "filesystem").toLowerCase();

  // If provider is filesystem without [id], display informational message
  if (!id && provider === "filesystem") {
    console.log(translate("spec_pull_filesystem_notice", lang));
    return { success: true };
  }

  const specSourceConfig: SpecSourceConfig = {
    ...configSpecSource,
    provider,
  };

  let specSource: SpecSource;
  try {
    specSource = SpecSourceFactory.create(provider, specSourceConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(translate("spec_pull_failed", lang, { error: message }));
    process.exitCode = 1;
    return { success: false };
  }

  let selectedId = id;

  try {
    if (!selectedId) {
      let items: SpecReference[] = [];
      try {
        items = await specSource.list();
      } catch {
        items = [];
      }

      if (items && items.length > 0) {
        const MANUAL_OPTION = "__manual__";
        const selected = await select({
          message: translate("spec_pull_select_item", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            ...items.map((item) => ({
              name: `${item.id} - ${item.title}`,
              value: item.id,
            })),
            {
              name: translate("spec_pull_manual_input_option", lang),
              value: MANUAL_OPTION,
            },
          ],
        });

        if (selected === "back") {
          return { back: true };
        }

        if (selected === MANUAL_OPTION) {
          selectedId = await input({
            message: translate("spec_pull_enter_id", lang),
            validate: (val) => val.trim().length > 0 || "ID is required",
          });
        } else {
          selectedId = selected;
        }
      } else {
        selectedId = await input({
          message: translate("spec_pull_enter_id", lang),
          validate: (val) => val.trim().length > 0 || "ID is required",
        });
      }
    }

    selectedId = selectedId?.trim();
    if (!selectedId) {
      return { success: false };
    }

    console.log(
      translate("spec_pull_fetching", lang, {
        id: selectedId,
        source: specSource.name,
      })
    );

    const useCase = new PullSpecUseCase(container.gw, specSource);
    const result = await useCase.execute({
      id: selectedId,
      customName: options?.name,
      specSource,
    });

    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "fetch-failed":
      case "error":
        console.error(
          translate("spec_pull_failed", lang, { error: result.error })
        );
        process.exitCode = 1;
        return { success: false };
      case "success":
        console.log(
          translate("spec_pull_success", lang, {
            id: result.spec.id,
            path: result.filePath,
          })
        );
        return { success: true };
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      return { back: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(translate("spec_pull_failed", lang, { error: message }));
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerSpecPullCommand(spec: Command): void {
  spec
    .command("pull [id]")
    .description("Pull a specification from an external source or issue tracker")
    .option("-s, --source <provider>", "Spec source provider (e.g. linear, github, clickup, filesystem)")
    .option("-n, --name <slug>", "Custom filename for the local spec file")
    .action(async (id?: string, options?: { source?: string; name?: string }) => {
      await specPullAction(id, options);
    });
}
