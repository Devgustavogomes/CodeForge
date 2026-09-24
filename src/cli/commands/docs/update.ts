import { Command } from "commander";
import { select, confirm } from "@inquirer/prompts";
import { AppContainer, createAppContainer } from "../../../infrastructure/container.js";
import { AffectedDoc } from "../../../domain/doc.js";
import { translate } from "../../ui/i18n.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { ActionResult } from "../../types.js";
import {
  isPromptCancellation,
  handlePromptCancellation,
  promptSelectIntent,
} from "../../common/prompts.js";

export async function docsUpdateAction(
  intent?: string,
  options?: { doc?: string },
  container: AppContainer = createAppContainer(),
): Promise<ActionResult> {
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  if (!config) {
    console.error(translate("err_not_configured", lang));
    process.exitCode = 1;
    return { success: false };
  }

  let selectedIntent = intent;

  try {
    if (!selectedIntent) {
      const selected = await promptSelectIntent(container, lang, {
        messageKey: "docs_update_select_intent",
      });

      if (selected === undefined) {
        return { success: false };
      }
      if (selected === null) {
        return { back: true };
      }
      selectedIntent = selected;
    }

  const useCase = container.updateDocUseCase;

  // Helper function to execute prompt using the usecase and UI
  const executeDocUpdate = async (
    docName: string,
    affectedDoc: AffectedDoc,
    isManual: boolean,
  ) => {
    const ui = new AgentProgressUI(
      translate("docs_update_ui_updating", lang, { docName }),
      config.plannerAgent,
    );
    console.log(translate("docs_update_updating_log", lang, { docName }));
    ui.init();
    ui.start();

    try {
      await useCase.execute(selectedIntent!, affectedDoc, isManual);
      ui.stop(true, translate("docs_update_ui_success", lang));
    } catch (error) {
      ui.stop(false, "Failed");
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      } else {
        console.error(error);
      }
      process.exitCode = 1;
    }
  };

  // ── Manual mode: user explicitly specified --doc <docname> ──────────────
  if (options?.doc) {
    const result = useCase.getManualDoc(selectedIntent, options.doc);

    switch (result.kind) {
      case "not-initialized":
        console.error(translate("err_not_initialized", lang));
        process.exitCode = 1;
        return { success: false };
      case "intent-not-found":
        console.error(
          translate("err_intent_not_found", lang, {
            intent: selectedIntent as string,          }),
        );
        process.exitCode = 1;
        return { success: false };
      case "doc-not-found":
        console.error(
          translate("docs_update_err_doc_not_found", lang, {
            doc: options.doc,
          }),
        );
        process.exitCode = 1;
        return { success: false };
      case "doc": {
        await executeDocUpdate(options.doc, result.doc, true);
        return { success: true };
      }
    }
  }

  // ── Automatic mode: scope-based manifest matching (default) ─────────────

  const result = useCase.getAffectedDocs(selectedIntent);

  switch (result.kind) {
    case "not-initialized":
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    case "intent-not-found":
      console.error(
        translate("err_intent_not_found", lang, {
          intent: selectedIntent as string,        }),
      );
      process.exitCode = 1;
      return { success: false };
    case "no-git":
      console.error(translate("docs_update_err_no_git", lang));
      process.exitCode = 1;
      return { success: false };
    case "no-changed-files":
      console.error(translate("docs_update_err_no_changed_files", lang));
      process.exitCode = 1;
      return { success: false };
    case "no-affected-docs":
      console.error(
        translate("docs_update_err_no_affected_docs", lang, {
          intent: selectedIntent as string,        }),
      );
      process.exitCode = 1;
      return { success: false };
    case "affected-docs":
      break; // proceed below
  }

  const affectedDocs = (result as Extract<typeof result, { kind: "affected-docs" }>).affectedDocs;

  console.log(
    translate("docs_update_affected_count", lang, {
      count: affectedDocs.length,
    }),
  );
  for (const doc of affectedDocs) {
    console.log(
      translate("docs_update_affected_item", lang, {
        docName: doc.docName,
        files: doc.matchedFiles.join(", "),
      }),
    );
  }
  console.log();

  let remaining = [...affectedDocs];

  while (remaining.length > 0) {
    const choices = remaining.map((doc) => ({
      name: translate("docs_update_doc_choice", lang, {
        docName: doc.docName,
        count: doc.matchedFiles.length,
      }),
      value: doc.docName,
    }));

    const selectedDocName = await select({
      message: translate("docs_update_select_doc", lang),
      choices,
    });

    const selectedDoc = remaining.find(
      (d) => d.docName === selectedDocName,
    );
    if (!selectedDoc) break;

    await executeDocUpdate(selectedDocName, selectedDoc, false);

    remaining = remaining.filter((d) => d.docName !== selectedDocName);

    if (remaining.length > 0) {
      const continueProcessing = await confirm({
        message: translate("docs_update_process_another", lang, {
          remaining: remaining.length,
        }),
        default: true,
      });

      if (!continueProcessing) break;
    }
  }

  return { success: true };
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      return handlePromptCancellation(lang);
    }
    throw error;
  }
}

export function registerDocsUpdateCommand(docs: Command): void {
  docs
    .command("update [intent]")
    .description(
      "Update documentation autonomously affected by changes from an intent execution",
    )
    .option(
      "--doc <doc>",
      "Manually specify which doc to update (skips scope matching)",
    )
    .action(async (intent?: string, options?: { doc?: string }) => {
      await docsUpdateAction(intent, options);
    });
}
