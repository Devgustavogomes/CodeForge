import { select } from "@inquirer/prompts";
import { spawn } from "node:child_process";
import path from "node:path";

export async function runInteractiveMenu(): Promise<void> {
  console.log("\nWelcome to CodeForge! 🚀");
  console.log("Select an action to get started:\n");

  const action = await select({
    message: "What do you want to do?",
    choices: [
      { name: "➜ Inicializar novo projeto (init)", value: "init" },
      { name: "➜ Criar nova especificação (spec create)", value: "spec create" },
      { name: "➜ Planejar tarefas (plan generate)", value: "plan generate" },
      { name: "➜ Validar plano de tarefas (plan validate)", value: "plan validate" },
      { name: "➜ Executar tarefas (run)", value: "run" },
      { name: "➜ Ver dashboard de progresso (status)", value: "status" },
      { name: "➜ Sair", value: "exit" },
    ],
  });

  if (action === "exit") {
    console.log("\nGoodbye! 👋\n");
    process.exit(0);
  }

  // We spawn the same node process, passing the selected command arguments
  const args = action.split(" ");
  
  // process.argv[1] is the path to the current script (cli.ts or cli.js)
  const scriptPath = process.argv[1];

  console.log(""); // Empty line for spacing
  
  const child = spawn(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}
