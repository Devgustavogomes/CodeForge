#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommand } from "./cli/commands/init.js";
import { registerSpecCreateCommand } from "./cli/commands/spec/create.js";
import { registerPlanGenerateCommand } from "./cli/commands/plan/generate.js";
import { registerPlanValidateCommand } from "./cli/commands/plan/validate.js";
import { registerRunCommand } from "./cli/commands/run.js";
import { registerStatusCommand } from "./cli/commands/status.js";
import { registerTaskCompleteCommand } from "./cli/commands/task/complete.js";
import { registerTaskRetryCommand } from "./cli/commands/task/retry.js";
import { registerTaskInfoCommand } from "./cli/commands/task/info.js";
import { registerDocsCreateCommand } from "./cli/commands/docs/create.js";

import { runInteractiveMenu } from "./cli/interactive.js";

const program = new Command();

program
  .name("codeforge")
  .description("CodeForge — Software Factory for AI-assisted development")
  .version("0.1.0");

registerInitCommand(program);
registerRunCommand(program);
registerStatusCommand(program);

const plan = program
  .command("plan")
  .description("Generate planning prompts and validate AI output");

registerPlanGenerateCommand(plan);
registerPlanValidateCommand(plan);

const spec = program
  .command("spec")
  .description("Manage specs");

registerSpecCreateCommand(spec);

const task = program
  .command("task")
  .description("Manage individual tasks during execution");

registerTaskCompleteCommand(task);
registerTaskRetryCommand(task);
registerTaskInfoCommand(task);

const docs = program
  .command("docs")
  .description("Manage documentation generation");

registerDocsCreateCommand(docs);

if (process.argv.length === 2) {
  // Run interactive menu if no arguments are provided
  runInteractiveMenu().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse();
}
