import { Command } from "commander";
import { runInteractiveMenu } from "../interactive.js";
import { ActionResult } from "../types.js";

export async function runAction(spec?: string): Promise<ActionResult> {
  await runInteractiveMenu({
    initialTab: "run",
    initialSpec: spec,
    autoStart: true,
  });
  return { success: true };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously")
    .action(async (spec?: string) => {
      await runAction(spec);
    });
}
