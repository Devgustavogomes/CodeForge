import { spawn } from "node:child_process";
import { input } from "@inquirer/prompts";
import { MenuAction } from "./types.js";

export async function executeAction(action: MenuAction): Promise<void> {
  const scriptPath = process.argv[1];
  
  if (action.type === "command") {
    console.log("");
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [scriptPath, ...action.args], {
        stdio: "inherit",
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
  }

  if (action.type === "command-with-input") {
    const userInput = await input({
      message: action.inputLabel,
    });
    
    if (!userInput || userInput.trim().length === 0) {
      console.error("\n✗ Nome do doc não pode ser vazio.\n");
      process.exit(1);
    }
    
    console.log("");
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [scriptPath, ...action.args, action.inputFlag, userInput.trim()], {
        stdio: "inherit",
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
  }
}
