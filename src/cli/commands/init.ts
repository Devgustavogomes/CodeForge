import { Command } from "commander";
import { select, input } from "@inquirer/prompts";
import { initializeWorkspace } from "../../application/initialize-workspace.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeForge in the current project")
    .action(async () => {
      const workspacePath = process.cwd();
      
      const agentChoice = await select({
        message: "Which AI coding agent will you use to execute the plans?",
        choices: [
          { name: "Claude Code", value: "npx @anthropic-ai/claude-code --print --prompt {prompt_file}" },
          { name: "Aider", value: "aider --message-file {prompt_file}" },
          { name: "Antigravity CLI (agy)", value: "agy --prompt {prompt_file}" },
          { name: "Other / Custom", value: "custom" },
          { name: "None (I will copy/paste prompts manually)", value: "" }
        ]
      });

      let agentCommand: string = agentChoice;
      if (agentChoice === "custom") {
        agentCommand = await input({
          message: "Enter the command to run your agent (use {prompt_file} for the prompt path):",
          default: "my-agent --prompt {prompt_file}"
        });
      }

      const result = initializeWorkspace(workspacePath, agentCommand);

      if (result.alreadyInitialized) {
        console.log("\n⚠ CodeForge is already initialized in this directory.\n");
        return;
      }

      console.log("\n✓ CodeForge initialized successfully.\n");
      console.log("Created:");
      for (const item of result.created) {
        console.log(`  ${item}`);
      }
      console.log("");
    });
}
