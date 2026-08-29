import { select, input } from "@inquirer/prompts";
import { spawn } from "node:child_process";

// ─── helpers ────────────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const scriptPath = process.argv[1];
  console.log("");
  const child = spawn(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code || 0));
}

// ─── sub-menus ───────────────────────────────────────────────────────────────

async function specMenu(): Promise<void> {
  const action = await select({
    message: "📄  Spec — o que deseja fazer?",
    choices: [
      { name: "Criar nova especificação          (spec create)", value: "spec create" },
      { name: "← Voltar ao menu principal", value: "back" },
    ],
  });
  if (action === "back") return;
  await runCommand(action.split(" "));
}

async function planMenu(): Promise<void> {
  const action = await select({
    message: "🗺️   Plan — o que deseja fazer?",
    choices: [
      { name: "Gerar prompt de planejamento      (plan generate)", value: "plan generate" },
      { name: "Validar plano de tarefas          (plan validate)", value: "plan validate" },
      { name: "← Voltar ao menu principal", value: "back" },
    ],
  });
  if (action === "back") return;
  await runCommand(action.split(" "));
}

async function taskMenu(): Promise<void> {
  const action = await select({
    message: "✅  Task — o que deseja fazer?",
    choices: [
      { name: "Ver informações de uma task       (task info)", value: "task info" },
      { name: "Marcar task como concluída        (task complete)", value: "task complete" },
      { name: "Retentar task com erro            (task retry)", value: "task retry" },
      { name: "← Voltar ao menu principal", value: "back" },
    ],
  });
  if (action === "back") return;
  await runCommand(action.split(" "));
}

async function docsMenu(): Promise<void> {
  const action = await select({
    message: "📚  Docs — o que deseja fazer?",
    choices: [
      {
        name: "Criar documentação para uma spec  (docs create)",
        value: "docs:create",
      },
      {
        name: "Atualizar docs afetados — automático via scope  (docs update)",
        value: "docs:update-auto",
      },
      {
        name: "Atualizar doc específico — você escolhe qual  (docs update --doc)",
        value: "docs:update-manual",
      },
      { name: "← Voltar ao menu principal", value: "back" },
    ],
  });

  if (action === "back") return;

  if (action === "docs:create") {
    await runCommand(["docs", "create"]);
    return;
  }

  if (action === "docs:update-auto") {
    await runCommand(["docs", "update"]);
    return;
  }

  if (action === "docs:update-manual") {
    const docName = await input({
      message: "Nome do doc a atualizar (ex: api-reference):",
    });
    if (!docName || docName.trim().length === 0) {
      console.error("\n✗ Nome do doc não pode ser vazio.\n");
      process.exit(1);
    }
    await runCommand(["docs", "update", "--doc", docName.trim()]);
  }
}

// ─── main menu ───────────────────────────────────────────────────────────────

export async function runInteractiveMenu(): Promise<void> {
  console.log("\nWelcome to CodeForge! 🚀");
  console.log("Selecione um grupo de comandos:\n");

  const group = await select({
    message: "O que deseja fazer?",
    choices: [
      { name: "🚀  Inicializar projeto                    (init)", value: "init" },
      { name: "📄  Spec        — criar especificações", value: "spec" },
      { name: "🗺️   Plan        — planejar e validar tarefas", value: "plan" },
      { name: "▶️   Run         — executar tarefas          (run)", value: "run" },
      { name: "📊  Status      — dashboard de progresso   (status)", value: "status" },
      { name: "✅  Task        — gerenciar tasks individuais", value: "task" },
      { name: "📚  Docs        — criar e atualizar documentação", value: "docs" },
      { name: "➜   Sair", value: "exit" },
    ],
  });

  switch (group) {
    case "exit":
      console.log("\nGoodbye! 👋\n");
      process.exit(0);
      break;
    case "init":
      await runCommand(["init"]);
      break;
    case "run":
      await runCommand(["run"]);
      break;
    case "status":
      await runCommand(["status"]);
      break;
    case "spec":
      await specMenu();
      break;
    case "plan":
      await planMenu();
      break;
    case "task":
      await taskMenu();
      break;
    case "docs":
      await docsMenu();
      break;
  }

  // After a sub-menu returns (user pressed "Voltar"), show main menu again
  return runInteractiveMenu();
}
