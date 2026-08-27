#!/usr/bin/env node

import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";

const program = new Command();

program
  .name("codeforge")
  .description("CodeForge — Software Factory for AI-assisted development")
  .version("0.1.0");

registerInitCommand(program);

program.parse();
