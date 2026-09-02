import fs from "node:fs";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../../application/plan.js";
import { prepareDocsPrompt } from "../../../application/docs.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { RunnerFactory } from "../../../runners/RunnerFactory.js";
import { TaskContext } from "../../../runners/AgentRunner.js";
import { AgentProgressUI } from "../../ui/AgentProgressUI.js";
import { translate } from "../../ui/i18n.js";

export function registerDocsCreateCommand(docs: Command): void {
  docs
    .command("create [doc-name]")
    .description("Generate documentation autonomously for a completed spec")
    .option("--spec <spec>", "Name of the spec to associate with the documentation")
    .action(async (docName?: string, options?: { spec?: string }) => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";
      
      if (!config) {
        console.error(translate("err_not_configured", lang));
        process.exitCode = 1;
        return;
      }

      if (!docName) {
        docName = await input({
          message: translate("docs_create_enter_name", lang),
        });

        if (!docName || docName.trim().length === 0) {
          console.error(translate("docs_create_err_empty_name", lang));
          process.exitCode = 1;
          return;
        }

        docName = docName.trim();
      }

      let selectedSpec = options?.spec;

      if (!selectedSpec) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error(translate("err_no_specs", lang));
          process.exitCode = 1;
          return;
        }

        selectedSpec = await select({
          message: translate("docs_create_select_spec", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            ...specs.map((s) => ({ name: s, value: s }))
          ],
        });

        if (selectedSpec === "back") {
          if (process.env.CODEFORGE_INTERACTIVE) {
            process.exit(200);
          } else {
            process.exit(0);
          }
        }
      }

      const result = prepareDocsPrompt(gw, docName, selectedSpec, config.language);

      let promptStr = "";
      switch (result.kind) {
        case "not-initialized":
          console.error(translate("err_not_initialized", lang));
          process.exitCode = 1;
          return;
        case "spec-not-found":
          console.error(translate("err_spec_not_found", lang, { spec: selectedSpec }));
          process.exitCode = 1;
          return;
        case "rules-not-found":
          console.error(translate("docs_create_err_rules_not_found", lang));
          process.exitCode = 1;
          return;
        case "already-exists":
          console.error(translate("docs_create_err_already_exists", lang, { docName }));
          process.exitCode = 1;
          return;
        case "prompt":
          promptStr = result.prompt;
          break;
      }

      console.log(translate("docs_create_generating", lang, { docName, spec: selectedSpec }));

      const docsDir = ".codeforge/docs";
      if (!gw.exists(docsDir)) {
        gw.mkdir(docsDir);
      }
      const promptPath = `${docsDir}/${docName}.prompt.md`;
      gw.writeFile(promptPath, promptStr);

      const runner = RunnerFactory.createRunner(config.environment);
      const context: TaskContext = {
        promptFilePath: promptPath,
        specName: selectedSpec,
        model: config.plannerAgent,
        silent: true,
      };

      const ui = new AgentProgressUI(translate("docs_create_ui_generating", lang), config.plannerAgent);
      ui.init();
      ui.start();

      try {
        await runner.execute(context);
        ui.stop(true, translate("docs_create_ui_success", lang));
      } catch (error) {
        ui.stop(false, "Failed");
        if (error instanceof Error) {
          console.error(`  ${error.message}`);
        } else {
          console.error(error);
        }
        process.exitCode = 1;
      } finally {
        if (fs.existsSync(promptPath)) {
          fs.unlinkSync(promptPath);
        }
      }
    });
}
