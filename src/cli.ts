#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommand } from "./cli/commands/init.js";
import { registerSpecCreateCommand } from "./cli/commands/spec/create.js";
import { registerPlanGenerateCommand } from "./cli/commands/plan/generate.js";
import { registerPlanValidateCommand } from "./cli/commands/plan/validate.js";

const program = new Command();

program
  .name("codeforge")
  .description("CodeForge — Software Factory for AI-assisted development")
  .version("0.1.0");

registerInitCommand(program);

const plan = program
  .command("plan")
  .description("Generate planning prompts and validate AI output");

registerPlanGenerateCommand(plan);
registerPlanValidateCommand(plan);

const spec = program
  .command("spec")
  .description("Manage specs");

registerSpecCreateCommand(spec);

program.parse();
