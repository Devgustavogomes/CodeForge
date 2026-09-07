import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { createAppContainer } from "../../infrastructure/container.js";
import { translate } from "../ui/i18n.js";
import { runInteractiveMenu } from "../interactive.js";
import { ActionResult } from "../types.js";
import { StatusResult } from "../../application/use-cases/GetSpecStatusUseCase.js";

export function formatPlainTextStatus(result: Extract<StatusResult, { kind: "status" }>): string {
  const lines: string[] = [];
  const total = result.tasks.length;
  const completed = result.tasks.filter((t) => t.status === "completed").length;
  const running = result.tasks.filter((t) => t.status === "running").length;
  const failed = result.tasks.filter((t) => t.status === "failed").length;
  const pending = result.tasks.filter((t) => t.status === "pending").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  lines.push(`Spec: ${result.specName} (${result.specStatus})`);
  lines.push(`Progress: ${completed}/${total} tasks completed (${percent}%)`);
  lines.push(`Summary: ${completed} completed, ${running} running, ${failed} failed, ${pending} pending`);
  lines.push("");
  lines.push("Tasks:");

  for (const task of result.tasks) {
    let icon = "○";
    if (task.status === "completed") icon = "✓";
    else if (task.status === "running") icon = "▶";
    else if (task.status === "failed") icon = "✗";

    let depStr = "";
    if (task.dependencies.length > 0) {
      depStr = ` [depends on: ${task.dependencies.join(", ")}]`;
    }

    lines.push(`  [${icon}] ${task.id}: ${task.title} (${task.status})${depStr}`);
    if (task.errors && task.errors.length > 0) {
      for (const err of task.errors) {
        lines.push(`      Error: ${err}`);
      }
    }
  }

  return lines.join("\n");
}

export async function statusAction(
  spec?: string,
  options: { once?: boolean } = {}
): Promise<ActionResult> {
  if (!options.once) {
    await runInteractiveMenu({
      initialTab: "run",
      initialSpec: spec,
    });
    return { success: true };
  }

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
        ...specs.map((s) => ({ name: s.name, value: s.name })),
      ],
    });

    if (specName === "back") {
      return { back: true };
    }
  }

  const useCase = container.getSpecStatusUseCase;
  const result = useCase.execute(specName);

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
      console.log(translate("status_no_execution", lang, { spec: specName }));
      return { success: true };
    case "status": {
      const summary = formatPlainTextStatus(result);
      console.log(summary);
      return { success: true };
    }
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
