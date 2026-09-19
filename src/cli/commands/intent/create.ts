import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";

export async function intentCreateAction(name?: string): Promise<ActionResult> {
  let intentName = name;

  if (!intentName) {
    try {
      intentName = await input({
        message: "What is the name of your new feature/intent? (e.g. user-authentication):",
        validate: (val) => val.trim().length > 0 || "Name is required",
      });
    } catch {
      return { back: true };
    }
  }

  // Format name: lowercase and replace spaces with hyphens
  intentName = intentName.trim().toLowerCase().replace(/\s+/g, "-");

  const container = createAppContainer();
  const useCase = container.createIntentUseCase ?? container.createIntentUseCase;
  const result = useCase.execute(intentName);

  switch (result.kind) {
    case "not-initialized":
      console.error(
        "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n"
      );
      process.exitCode = 1;
      return { success: false };
    case "already-exists":
      console.log(`\nIntent already exists: ${result.filePath}\n`);
      return { success: true };
    case "created":
      console.log(`\n✓ Intent created: ${result.filePath}\n`);
      return { success: true };
  }
}

export function registerIntentCreateCommand(intent: Command): void {
  intent
    .command("create [name]")
    .description("Create a new intent file")
    .action(async (name?: string) => {
      await intentCreateAction(name);
    });
}
