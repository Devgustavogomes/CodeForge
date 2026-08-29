import { Command } from "commander";
import { initializeWorkspace } from "../../application/initialize-workspace.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeForge in the current project")
    .action(async () => {
      const workspacePath = process.cwd();

      const result = initializeWorkspace(workspacePath);

      switch (result.kind) {
        case "already-initialized":
          console.log("\n⚠ CodeForge is already initialized in this directory.\n");
          break;
        case "created":
          console.log("\n✓ CodeForge initialized successfully.\n");
          console.log("Created:");
          for (const item of result.created) {
            console.log(`  ${item}`);
          }
          console.log("");
          break;
      }
    });
}
