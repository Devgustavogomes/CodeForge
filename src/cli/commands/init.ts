import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { initializeWorkspace } from "../../application/initialize-workspace.js";
import { select, input } from "@inquirer/prompts";
import { RunnerFactory } from "../../runners/RunnerFactory.js";
import {
  getAgentsForEnvironment,
  saveConfiguration,
} from "../../application/configure-environment.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeForge in the current project")
    .action(async () => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      const result = initializeWorkspace(gw);

      switch (result.kind) {
        case "already-initialized":
          console.log(
            "\n⚠ CodeForge is already initialized in this directory.",
          );
          console.log("Continuing with interactive configuration...\n");
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

      const environments = RunnerFactory.getAvailableEnvironments();
      const environment = await select({
        message: "Select your environment:",
        choices: environments.map((env) => ({ name: env, value: env })),
      });

      console.log(`Introspecting ${environment} for available agents...`);
      const availableAgents = await getAgentsForEnvironment(environment);

      let plannerAgent = "";
      let executorAgent = "";

      if (availableAgents.length > 0) {
        plannerAgent = await select({
          message: "Select your planner agent:",
          choices: availableAgents.map((agent) => ({
            name: agent,
            value: agent,
          })),
        });
        executorAgent = await select({
          message: "Select your executor agent:",
          choices: availableAgents.map((agent) => ({
            name: agent,
            value: agent,
          })),
        });
      } else {
        plannerAgent = await input({
          message: "Enter your planner agent (e.g., default):",
          default: "default",
        });
        executorAgent = await input({
          message: "Enter your executor agent (e.g., default):",
          default: "default",
        });
      }

      saveConfiguration(gw, { environment, plannerAgent, executorAgent });

      console.log("\n✓ Configuration saved successfully.\n");
    });
}
