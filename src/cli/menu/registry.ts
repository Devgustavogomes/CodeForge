import { MenuGroup } from "./types.js";

export const menuGroups: MenuGroup[] = [
  {
    id: "init",
    label: "🚀  Inicializar projeto                    (init)",
    action: { type: "command", args: ["init"] }
  },
  {
    id: "spec",
    label: "📄  Spec        — criar especificações",
    items: [
      { name: "Criar nova especificação          (spec create)", value: "spec create", action: { type: "command", args: ["spec", "create"] } },
      { name: "← Voltar ao menu principal", value: "back" }
    ]
  },
  {
    id: "plan",
    label: "🗺️   Plan        — planejar e validar tarefas",
    items: [
      { name: "Gerar prompt de planejamento      (plan generate)", value: "plan generate", action: { type: "command", args: ["plan", "generate"] } },
      { name: "Validar plano de tarefas          (plan validate)", value: "plan validate", action: { type: "command", args: ["plan", "validate"] } },
      { name: "← Voltar ao menu principal", value: "back" }
    ]
  },
  {
    id: "run",
    label: "▶️   Run         — executar tarefas          (run)",
    action: { type: "command", args: ["run"] }
  },
  {
    id: "status",
    label: "📊  Status      — dashboard de progresso   (status)",
    action: { type: "command", args: ["status"] }
  },
  {
    id: "task",
    label: "✅  Task        — gerenciar tasks individuais",
    items: [
      { name: "Ver informações de uma task       (task info)", value: "task info", action: { type: "command", args: ["task", "info"] } },
      { name: "Marcar task como concluída        (task complete)", value: "task complete", action: { type: "command", args: ["task", "complete"] } },
      { name: "Retentar task com erro            (task retry)", value: "task retry", action: { type: "command", args: ["task", "retry"] } },
      { name: "← Voltar ao menu principal", value: "back" }
    ]
  },
  {
    id: "docs",
    label: "📚  Docs        — criar e atualizar documentação",
    items: [
      {
        name: "Criar documentação para uma spec  (docs create)",
        value: "docs:create",
        action: { type: "command", args: ["docs", "create"] }
      },
      {
        name: "Atualizar docs afetados — automático via scope  (docs update)",
        value: "docs:update-auto",
        action: { type: "command", args: ["docs", "update"] }
      },
      {
        name: "Atualizar doc específico — você escolhe qual  (docs update --doc)",
        value: "docs:update-manual",
        action: { type: "command-with-input", args: ["docs", "update"], inputLabel: "Nome do doc a atualizar (ex: api-reference):", inputFlag: "--doc" }
      },
      { name: "← Voltar ao menu principal", value: "back" }
    ]
  },
  {
    id: "exit",
    label: "➜   Sair"
  }
];
