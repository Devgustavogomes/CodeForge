import { translate } from "../ui/i18n.js";
import { SupportedLanguage } from "../../config/types.js";
import { MenuGroup } from "./types.js";

export function getMenuGroups(lang: SupportedLanguage): MenuGroup[] {
  return [
    {
      id: "init",
      label: translate("menu_init_label", lang),
      action: { type: "command", args: ["init"] }
    },
    {
      id: "spec",
      label: translate("menu_spec_label", lang),
      items: [
        { name: translate("menu_spec_create", lang), value: "spec create", action: { type: "command", args: ["spec", "create"] } },
        { name: translate("menu_back", lang), value: "back" }
      ]
    },
    {
      id: "plan",
      label: translate("menu_plan_label", lang),
      items: [
        { name: translate("menu_plan_generate", lang), value: "plan generate", action: { type: "command", args: ["plan", "generate"] } },
        { name: translate("menu_plan_validate", lang), value: "plan validate", action: { type: "command", args: ["plan", "validate"] } },
        { name: translate("menu_back", lang), value: "back" }
      ]
    },
    {
      id: "run",
      label: translate("menu_run_label", lang),
      action: { type: "command", args: ["run"] }
    },
    {
      id: "status",
      label: translate("menu_status_label", lang),
      action: { type: "command", args: ["status"] }
    },
    {
      id: "task",
      label: translate("menu_task_label", lang),
      items: [
        { name: translate("menu_task_info", lang), value: "task info", action: { type: "command", args: ["task", "info"] } },
        { name: translate("menu_task_complete", lang), value: "task complete", action: { type: "command", args: ["task", "complete"] } },
        { name: translate("menu_task_retry", lang), value: "task retry", action: { type: "command", args: ["task", "retry"] } },
        { name: translate("menu_back", lang), value: "back" }
      ]
    },
    {
      id: "docs",
      label: translate("menu_docs_label", lang),
      items: [
        {
          name: translate("menu_docs_create", lang),
          value: "docs:create",
          action: { type: "command", args: ["docs", "create"] }
        },
        {
          name: translate("menu_docs_update_auto", lang),
          value: "docs:update-auto",
          action: { type: "command", args: ["docs", "update"] }
        },
        {
          name: translate("menu_docs_update_manual", lang),
          value: "docs:update-manual",
          action: { type: "command-with-input", args: ["docs", "update"], inputLabel: translate("menu_docs_update_manual_input", lang), inputFlag: "--doc" }
        },
        { name: translate("menu_back", lang), value: "back" }
      ]
    },
    {
      id: "config",
      label: translate("menu_config_label", lang),
      action: { type: "command", args: ["config"] }
    },
    {
      id: "exit",
      label: translate("menu_exit", lang)
    }
  ];
}
