import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { createAppContainer } from "../../../infrastructure/container.js";
import { ActionResult } from "../../types.js";

export async function specCreateAction(name?: string): Promise<ActionResult> {
  let specName = name;
  
  if (!specName) {
    try {
      specName = await input({
        message: "What is the name of your new feature/spec? (e.g. user-authentication):",
        validate: (val) => val.trim().length > 0 || "Name is required",
      });
    } catch {
      return { back: true };
    }
  }

  // Format name: lowercase and replace spaces with hyphens
  specName = specName.trim().toLowerCase().replace(/\s+/g, '-');

  const container = createAppContainer();
  const useCase = container.createSpecUseCase;
  const result = useCase.execute(specName);

  switch (result.kind) {
    case "not-initialized":
      console.error(
        "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n"
      );
      process.exitCode = 1;
      return { success: false };
    case "already-exists":
      console.log(`\nSpec already exists: ${result.filePath}\n`);
      return { success: true };
    case "created":
      console.log(`\n✓ Spec created: ${result.filePath}\n`);
      return { success: true };
  }
}

export function registerSpecCreateCommand(spec: Command): void {
  spec
    .command("create [name]")
    .description("Create a new spec file")
    .action(async (name?: string) => {
      await specCreateAction(name);
    });
}
