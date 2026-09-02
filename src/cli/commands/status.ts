import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { getSpecStatus, formatStatusOutput } from "../../application/status.js";
import { translate } from "../ui/i18n.js";
import { ConfigService } from "../../config/ConfigService.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status [spec]")
    .description("Show execution progress for a spec (watches by default)")
    .option("--once", "Print status once and exit")
    .action(async (spec: string | undefined, options: { once?: boolean }) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = config?.language || "en";

      let specName = spec;

      if (!specName) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error(translate("err_no_specs_run", lang));
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: translate("status_select_spec", lang),
          choices: [
            { name: translate("menu_back", lang), value: "back" },
            ...specs.map((s) => ({ name: s, value: s }))
          ],
        });

        if (specName === "back") {
          if (process.env.CODEFORGE_INTERACTIVE) {
            process.exit(200);
          } else {
            process.exit(0);
          }
        }
      }

      // Validate once before entering loop
      const initial = getSpecStatus(gw, specName);

      switch (initial.kind) {
        case "not-initialized":
          console.error(translate("err_not_initialized", lang));
          process.exitCode = 1;
          return;
        case "spec-not-found":
          console.error(translate("err_spec_not_found", lang, { spec: specName }));
          process.exitCode = 1;
          return;
        case "no-execution":
          console.log(translate("status_no_execution", lang, { spec: specName }));
          return;
        case "status":
          if (options.once) {
            console.log(formatStatusOutput(initial));
            return;
          }
          break;
      }

      // Watch mode — enter alternate screen buffer (like vim/htop)
      process.stdout.write("\x1b[?1049h\x1b[?25l");

      const cleanup = () => {
        clearInterval(interval);
        // Leave alternate screen buffer and restore cursor
        process.stdout.write("\x1b[?25h\x1b[?1049l");
      };

      const render = () => {
        const result = getSpecStatus(gw, specName as string);
        process.stdout.write("\x1b[H");
        if (result.kind === "status") {
          process.stdout.write(formatStatusOutput(result));
          process.stdout.write(translate("status_watching", lang));
        } else {
          process.stdout.write(translate("status_waiting", lang));
        }
        return result;
      };

      let lastResult = render();

      const interval = setInterval(() => {
        lastResult = render();

        if (lastResult.kind === "status") {
          const allDone = lastResult.tasks.every((t) => t.status === "completed");
          if (allDone) {
            cleanup();
            console.log(translate("status_all_done", lang, { spec: specName as string }));
          }
        }
      }, 2000);

      process.stdout.on("resize", () => render());

      process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
    });
}
