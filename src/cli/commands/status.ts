import { select } from "@inquirer/prompts";
import { Command } from "commander";
import { createAppContainer } from "../../infrastructure/container.js";
import { ActionResult } from "../types.js";
import { translate } from "../ui/i18n.js";
import { formatStatusOutput } from "../ui/statusFormatter.js";

export { formatPlainTextStatus } from "../ui/statusFormatter.js";

export async function statusAction(
  spec?: string,
  _options: { once?: boolean } = {},
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
        ...specs.map((item) => ({ name: item.name, value: item.name })),
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  const result = container.getSpecStatusUseCase.execute(specName);

  switch (result.kind) {
    case "not-initialized":
      console.error(translate("err_not_initialized", lang));
      process.exitCode = 1;
      return { success: false };
    case "spec-not-found":
      console.error(translate("err_spec_not_found", lang, { spec: specName }));
      process.exitCode = 1;
      return { success: false };
    case "no-execution":
      console.log(translate("status_no_execution", lang, { spec: result.specName }));
      return { success: true };
    case "status":
      console.log(formatStatusOutput(result, { language: lang }));
      return { success: true };
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status [spec]")
    .description("Show execution progress for a spec")
    .option("--once", "Print status once and exit")
    .action(async (spec: string | undefined, options: { once?: boolean }) => {
      await statusAction(spec, options);
    });
}
