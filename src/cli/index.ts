#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerSpecCreateCommand } from "./commands/spec/create.js";
import { registerSpecPullCommand } from "./commands/spec/pull.js";
import { registerSpecListCommand } from "./commands/spec/list.js";
import { registerSpecDeleteCommand } from "./commands/spec/delete.js";
import { registerPlanGenerateCommand } from "./commands/plan/generate.js";
import { registerPlanValidateCommand } from "./commands/plan/validate.js";
import { registerRunCommand } from "./commands/run.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTaskCompleteCommand } from "./commands/task/complete.js";
import { registerTaskRetryCommand } from "./commands/task/retry.js";
import { registerTaskResetCommand } from "./commands/task/reset.js";
import { registerTaskInfoCommand } from "./commands/task/info.js";
import { registerTaskDeleteCommand } from "./commands/task/delete.js";
import { registerDocsCreateCommand } from "./commands/docs/create.js";
import { registerDocsUpdateCommand } from "./commands/docs/update.js";
import { registerDocsDeleteCommand } from "./commands/docs/delete.js";
import { registerConfigCommand } from "./commands/config.js";

import { runInteractiveMenu } from "./interactive.js";
import {
  launchExternalTerminal,
  shouldLaunchExternalTerminal,
} from "./launcher/externalTerminal.js";

const program = new Command();

program
  .name("codeforge")
  .description("CodeForge — Software Factory for AI-assisted development")
  .version("0.3.0")
  .option(
    "--inline, -i",
    "Run TUI in the current terminal instead of opening an external window",
  );

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
registerSpecPullCommand(spec);
registerSpecListCommand(spec);
registerSpecDeleteCommand(spec);

const task = program
  .command("task")
  .description("Manage individual tasks during execution");

registerTaskCompleteCommand(task);
registerTaskRetryCommand(task);
registerTaskResetCommand(task);
registerTaskInfoCommand(task);
registerTaskDeleteCommand(task);

const docs = program
  .command("docs")
  .description("Manage documentation generation");

registerDocsCreateCommand(docs);
registerDocsUpdateCommand(docs);
registerDocsDeleteCommand(docs);

const shouldLaunch = shouldLaunchExternalTerminal(
  process.argv.slice(2),
  process.env,
);

if (shouldLaunch) {
  const launched = launchExternalTerminal(process.argv.slice(2), process.cwd());
  if (launched) {
    process.exit(0);
  } else {
    console.error("Failed to launch external terminal.");
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const isInlineFlag = (arg: string) =>
  arg === "-i" || arg === "--inline" || arg.startsWith("--inline=");
const isInlineOnly = args.length > 0 && args.every(isInlineFlag);

if (args.length === 0 || isInlineOnly) {
  // Run interactive menu if no arguments or only inline flags are provided
  runInteractiveMenu().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse();
}
