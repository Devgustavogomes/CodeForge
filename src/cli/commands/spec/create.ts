import { Command } from "commander";
import { createSpec } from "../../../application/create-spec.js";

export function registerSpecCreateCommand(spec: Command): void {
  spec
    .command("create <name>")
    .description("Create a new spec file")
    .action((name: string) => {
      const result = createSpec(process.cwd(), name);

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
