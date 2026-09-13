import { confirm, select } from "@inquirer/prompts";
import { Command } from "commander";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { translate } from "../../ui/i18n.js";

export interface SpecDeleteOptions {
  force?: boolean;
}

function isPromptCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

export async function specDeleteAction(
  name?: string,
  options: SpecDeleteOptions = {},
): Promise<ActionResult> {
  let specName = name;
  let lang: "en" | "pt" | "es" = "en";

  try {
    const container = createAppContainer();
    const config = container.configService.loadConfig();
    lang = config?.language || "en";

    if (!specName) {
      const specs = container.listSpecsUseCase.execute();
      if (specs.length === 0) {
        console.error(translate("spec_delete_no_specs", lang));
        process.exitCode = 1;
        return { success: false };
      }

      specName = await select({
        message: translate("spec_delete_select", lang),
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          ...specs.map((spec) => ({ name: spec.name, value: spec.name })),
        ],
      });

      if (specName === "back") {
        return { back: true };
      }
    }

    if (!options.force) {
      const confirmed = await confirm({
        message: translate("spec_delete_confirm", lang, { spec: specName }),
        default: false,
      });

      if (!confirmed) {
        console.log(translate("delete_cancelled", lang));
        return { back: true };
      }
    }

    const result = container.deleteSpecUseCase.execute(specName);
    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "spec-not-found":
        console.error(
          translate("spec_delete_not_found", lang, { spec: specName }),
        );
        process.exitCode = 1;
        return { success: false };
      case "deleted":
        console.log(
          translate("spec_delete_success", lang, { spec: result.specName }),
        );
        return { success: true };
    }
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      console.log(translate("delete_cancelled", lang));
      return { back: true };
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(
      translate("spec_delete_error", lang, {
        spec: specName || name || "",
        error: message,
      }),
    );
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerSpecDeleteCommand(spec: Command): void {
  spec
    .command("delete [name]")
    .alias("rm")
    .description("Delete a specification and all of its related artifacts")
    .option("-f, --force", "Skip the deletion confirmation")
    .action(async (name?: string, options?: SpecDeleteOptions) => {
      await specDeleteAction(name, options);
    });
}
