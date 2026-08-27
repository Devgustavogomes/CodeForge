import { Command } from "commander";
import { initializeWorkspace } from "../../application/initialize-workspace.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeForge in the current project")
    .action(() => {
      const result = initializeWorkspace(process.cwd());

      if (result.alreadyInitialized) {
        console.log("\nCodeForge is already initialized in this project.\n");
        return;
      }

      console.log("\n✓ CodeForge initialized successfully.\n");
      console.log("Created:");
      for (const item of result.created) {
        console.log(`  ${item}`);
      }
      console.log();
    });
}
