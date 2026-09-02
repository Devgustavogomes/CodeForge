import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { CreateSpecUseCase } from "../../../application/use-cases/CreateSpecUseCase.js";

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

      const gw = new NodeWorkspaceGateway(process.cwd());
      const useCase = new CreateSpecUseCase(gw);
      const result = useCase.execute(specName);

      switch (result.kind) {
        case "not-initialized":
          console.error(
            "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n"
          );
          process.exitCode = 1;
          break;
        case "already-exists":
          console.log(`\nSpec already exists: ${result.filePath}\n`);
          break;
        case "created":
          console.log(`\n✓ Spec created: ${result.filePath}\n`);
          break;
      }
    });
}
