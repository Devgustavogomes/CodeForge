import fs from "node:fs";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { NodeGitGateway } from "../../../infrastructure/git/NodeGitGateway.js";
import { Command } from "commander";
import { select, confirm } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { UpdateDocUseCase } from "../../../application/use-cases/UpdateDocUseCase.js";
import { translate } from "../../ui/i18n.js";

export function registerDocsUpdateCommand(docs: Command): void {
  docs
    .command("update [spec]")
    .description("Update documentation autonomously affected by changes from a spec execution")
    .option("--doc <doc>", "Manually specify which doc to update (skips scope matching)")
    .action(async (spec?: string, options?: { doc?: string }) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      const git = new NodeGitGateway(gw);

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";

      if (!config) {
        console.error(translate("err_not_configured", lang));
        process.exitCode = 1;
        return;
      }

      let selectedSpec = spec;

      if (!selectedSpec) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error(translate("err_no_specs", lang));
          process.exitCode = 1;
          return;
        }

        selectedSpec = await select({
          message: translate("docs_update_select_spec", lang),
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const runner = RunnerFactory.createRunner(config.environment);
      const useCase = new UpdateDocUseCase(gw, git, runner, config);

      // Helper function to execute prompt using the usecase and UI
      const executeDocUpdate = async (docName: string, affectedDoc: any, isManual: boolean) => {
        const ui = new AgentProgressUI(translate("docs_update_ui_updating", lang, { docName }), config.plannerAgent);
        console.log(translate("docs_update_updating_log", lang, { docName }));
        ui.init();
        ui.start();

        try {
          await useCase.execute(selectedSpec!, affectedDoc, isManual);
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
        const result = useCase.getManualDoc(selectedSpec, options.doc);

        switch (result.kind) {
          case "not-initialized":
            console.error(translate("err_not_initialized", lang));
            process.exitCode = 1;
            return;
          case "spec-not-found":
            console.error(translate("err_spec_not_found", lang, { spec: selectedSpec as string }));
            process.exitCode = 1;
            return;
          case "rules-not-found":
            console.error(translate("docs_update_err_rules_not_found", lang));
            process.exitCode = 1;
            return;
          case "doc-not-found":
            console.error(translate("docs_update_err_doc_not_found", lang, { doc: options.doc }));
            process.exitCode = 1;
            return;
          case "doc": {
            await executeDocUpdate(options.doc, result.doc, true);
            return;
          }
        }
      }

      // ── Automatic mode: scope-based manifest matching (default) ─────────────

      const result = useCase.getAffectedDocs(selectedSpec);

      switch (result.kind) {
        case "not-initialized":
          console.error(translate("err_not_initialized", lang));
          process.exitCode = 1;
          return;
        case "spec-not-found":
          console.error(translate("err_spec_not_found", lang, { spec: selectedSpec as string }));
          process.exitCode = 1;
          return;
        case "rules-not-found":
          console.error(translate("docs_update_err_rules_not_found", lang));
          process.exitCode = 1;
          return;
        case "no-git":
          console.error(translate("docs_update_err_no_git", lang));
          process.exitCode = 1;
          return;
        case "no-changed-files":
          console.error(translate("docs_update_err_no_changed_files", lang));
          process.exitCode = 1;
          return;
        case "no-affected-docs":
          console.error(translate("docs_update_err_no_affected_docs", lang, { spec: selectedSpec as string }));
          process.exitCode = 1;
          return;
        case "affected-docs":
          break; // proceed below
      }

      const { affectedDocs } = result;

      console.log(translate("docs_update_affected_count", lang, { count: affectedDocs.length }));
      for (const doc of affectedDocs) {
        console.log(translate("docs_update_affected_item", lang, { docName: doc.docName, files: doc.matchedFiles.join(", ") }));
      }
      console.log();

      let remaining = [...affectedDocs];

      while (remaining.length > 0) {
        const choices = remaining.map((doc) => ({
          name: translate("docs_update_doc_choice", lang, { docName: doc.docName, count: doc.matchedFiles.length }),
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
            message: translate("docs_update_process_another", lang, { remaining: remaining.length }),
            default: true,
          });

          if (!continueProcessing) break;
        }
      }
    });
}
