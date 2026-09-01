import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { ConfigService } from "../../config/ConfigService.js";
import { RunnerFactory } from "../../runners/RunnerFactory.js";
import { TaskScheduler } from "../../scheduler/TaskScheduler.js";
import { PATHS } from "../../infrastructure/paths.js";
import { TerminalSchedulerReporter } from "../ui/TerminalSchedulerReporter.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run [spec]")
    .description("Execute tasks for a given spec autonomously")
    .action(async (spec?: string) => {
      const gw = new NodeWorkspaceGateway(process.cwd());

      if (!gw.exists(PATHS.metadata)) {
        console.error(
          "\n✗ CodeForge is not initialized. Run `codeforge init` first.\n",
        );
        process.exitCode = 1;
        return;
      }

      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      if (!config) {
        console.error(
          "\n✗ CodeForge is not configured. Run `codeforge init` first.\n",
        );
        process.exitCode = 1;
        return;
      }

      let specName = spec;

      if (!specName) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error("\n✗ No specs found.\n");
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: "Select a spec to execute:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      const runner = RunnerFactory.createRunner(config.environment);
      const reporter = new TerminalSchedulerReporter(gw);
      const scheduler = new TaskScheduler(gw, runner, reporter);

      await scheduler.run(specName, config.executorAgent);
    });
}
