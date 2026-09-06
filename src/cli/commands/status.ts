import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { formatStatusOutput } from "../ui/statusFormatter.js";
import { translate } from "../ui/i18n.js";
import { createAppContainer } from "../../infrastructure/container.js";

import { ActionResult } from "../menu/types.js";

export async function statusAction(
  spec?: string,
  options: { once?: boolean } = {}
): Promise<ActionResult> {
  const container = createAppContainer();
  const config = container.configService.loadConfig();
  const lang = config?.language || "en";

  let specName = spec;

  if (!specName) {
    const specs = container.listSpecsUseCase.execute();

    if (specs.length === 0) {
      console.error(translate("err_no_specs_run", lang));
      process.exitCode = 1;
      return { success: false };
    }

    specName = await select({
      message: translate("status_select_spec", lang),
      choices: [
        { name: translate("menu_back", lang), value: "back" },
        ...specs.map((s) => ({ name: s.name, value: s.name }))
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  // Validate once before entering loop
  const useCase = container.getSpecStatusUseCase;
  const initial = useCase.execute(specName);

  switch (initial.kind) {
    case "not-initialized":
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    case "spec-not-found":
      console.error(translate("err_spec_not_found", lang, { spec: specName }));
      process.exitCode = 1;
      return { success: false };
    case "no-execution":
      console.log(translate("status_no_execution", lang, { spec: specName }));
      return { success: true };
    case "status":
      if (options.once) {
        console.log(formatStatusOutput(initial));
        return { success: true };
      }
      break;
  }

  // Watch mode — enter alternate screen buffer (like vim/htop)
  process.stdout.write("\x1b[?1049h\x1b[?25l");

  let interval: NodeJS.Timeout;
  const cleanup = () => {
    clearInterval(interval);
    // Leave alternate screen buffer and restore cursor
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  };

  const render = () => {
    const result = useCase.execute(specName as string);
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

  return new Promise<ActionResult>((resolve) => {
    interval = setInterval(() => {
      lastResult = render();

      if (lastResult.kind === "status") {
        if (lastResult.specStatus === "failed") {
          cleanup();
          console.log(translate("status_failed", lang, { spec: specName as string }));
          process.exitCode = 1;
          resolve({ success: false });
          return;
        }
        const allDone = lastResult.tasks.every((t) => t.status === "completed");
        if (allDone) {
          cleanup();
          console.log(translate("status_all_done", lang, { spec: specName as string }));
          resolve({ success: true });
          return;
        }
      }
    }, 2000);

    const onResize = () => render();
    process.stdout.on("resize", onResize);

    const onSigInt = () => {
      cleanup();
      process.stdout.off("resize", onResize);
      process.off("SIGINT", onSigInt);
      resolve({ success: true });
    };
    process.once("SIGINT", onSigInt);
  });
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status [spec]")
    .description("Show execution progress for a spec (watches by default)")
    .option("--once", "Print status once and exit")
    .action(async (spec: string | undefined, options: { once?: boolean }) => {
      await statusAction(spec, options);
    });
}
