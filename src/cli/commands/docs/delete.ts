import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";
import { translate } from "../../ui/i18n.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptConfirmAction,
} from "../../common/prompts.js";

export interface DocsDeleteOptions {
  force?: boolean;
}

export async function docsDeleteAction(
  name?: string,
  options: DocsDeleteOptions = {},
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  let docName = name;
  let lang: "en" | "pt" | "es" = "en";

  try {
    const config = container.configService.loadConfig();
    lang = config?.language || "en";

    if (!docName) {
      const manifest = container.docsManifestRepository.load();
      const documents = Object.keys(manifest.documents).sort();

      if (documents.length === 0) {
        console.error(translate("docs_delete_no_docs", lang));
        process.exitCode = 1;
        return { success: false };
      }

      docName = await select({
        message: translate("docs_delete_select", lang),
        choices: [
          { name: translate("menu_back", lang), value: "back" },
          ...documents.map((document) => ({
            name: document,
            value: document,
          })),
        ],
      });

      if (docName === "back") {
        return { back: true };
      }
    }

    if (!options.force) {
      const confirmed = await promptConfirmAction(
        translate("docs_delete_confirm", lang, { doc: docName }),
        lang,
      );

      if (!confirmed) {
        return { back: true };
      }
    }

    const result = container.deleteDocUseCase.execute(docName);
    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "doc-not-found":
        console.error(
          translate("docs_delete_not_found", lang, { doc: docName }),
        );
        process.exitCode = 1;
        return { success: false };
      case "deleted":
        console.log(
          translate("docs_delete_success", lang, { doc: result.docName }),
        );
        return { success: true };
    }
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(
      translate("docs_delete_error", lang, {
        doc: docName || name || "",
        error: message,
      }),
    );
    process.exitCode = 1;
    return { success: false };
  }
}

export function registerDocsDeleteCommand(docs: Command): void {
  docs
    .command("delete [name]")
    .alias("rm")
    .description("Delete a registered documentation file")
    .option("-f, --force", "Skip the deletion confirmation")
    .action(async (name?: string, options?: DocsDeleteOptions) => {
      await docsDeleteAction(name, options);
    });
}
