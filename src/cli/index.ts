#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerSpecCreateCommand } from "./commands/spec/create.js";
import { registerPlanGenerateCommand } from "./commands/plan/generate.js";
import { registerPlanValidateCommand } from "./commands/plan/validate.js";
import { registerRunCommand } from "./commands/run.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTaskCompleteCommand } from "./commands/task/complete.js";
import { registerTaskRetryCommand } from "./commands/task/retry.js";
import { registerTaskResetCommand } from "./commands/task/reset.js";
import { registerTaskInfoCommand } from "./commands/task/info.js";
import { registerDocsCreateCommand } from "./commands/docs/create.js";
import { registerDocsUpdateCommand } from "./commands/docs/update.js";
import { registerConfigCommand } from "./commands/config.js";

import { runInteractiveMenu } from "./interactive.js";

const program = new Command();

program
  .name("codeforge")
  .description("CodeForge — Software Factory for AI-assisted development")
  .version("0.3.0");

registerInitCommand(program);
registerRunCommand(program);
registerStatusCommand(program);
registerConfigCommand(program);

const plan = program
  .command("plan")
  .description("Generate planning prompts and validate AI output");

registerPlanGenerateCommand(plan);
registerPlanValidateCommand(plan);

const spec = program.command("spec").description("Manage specs");

registerSpecCreateCommand(spec);

const task = program
  .command("task")
  .description("Manage individual tasks during execution");

registerTaskCompleteCommand(task);
registerTaskRetryCommand(task);
registerTaskResetCommand(task);
registerTaskInfoCommand(task);

const docs = program
  .command("docs")
  .description("Manage documentation generation");

registerDocsCreateCommand(docs);
registerDocsUpdateCommand(docs);

if (process.argv.length === 2) {
  // Run interactive menu if no arguments are provided
  runInteractiveMenu().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse();
}
