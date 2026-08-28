import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { createSpec } from "../../../application/create-spec.js";

export function registerSpecCreateCommand(spec: Command): void {
  spec
    .command("create [name]")
    .description("Create a new spec file")
    .action(async (name?: string) => {
      let specName = name;
      
      if (!specName) {
        specName = await input({
          message: "What is the name of your new feature/spec? (e.g. user-authentication):",
          validate: (val) => val.trim().length > 0 || "Name is required",
        });
      }

      // Format name: lowercase and replace spaces with hyphens
      specName = specName.trim().toLowerCase().replace(/\s+/g, '-');

      const result = createSpec(process.cwd(), specName);

      if (result.notInitialized) {
        console.error(
          "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n"
        );
        process.exitCode = 1;
        return;
      }

      if (result.alreadyExists) {
        console.log(`\nSpec already exists: ${result.filePath}\n`);
        return;
      }

      console.log(`\n✓ Spec created: ${result.filePath}\n`);
    });
}
