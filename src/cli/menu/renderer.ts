import { select } from "@inquirer/prompts";
import { getMenuGroups } from "./registry.js";
import { executeAction } from "./executor.js";
import { MenuGroup, MenuItem } from "./types.js";
import { ConfigService } from "../../config/ConfigService.js";
import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { translate } from "../ui/i18n.js";

export async function renderMainMenu(initialGroupId?: string): Promise<void> {
  const gw = new NodeWorkspaceGateway(process.cwd());
  const configService = new ConfigService(gw);
  const config = configService.loadConfig();
  const lang = config?.language || "en";

  if (!initialGroupId) {
    console.log(`\n${translate("menu_welcome", lang)} 🚀`);
    console.log(`${translate("menu_select_group", lang)}\n`);
  }

  const menuGroups = getMenuGroups(lang);

  const groupChoices = menuGroups.map((g: MenuGroup) => ({
    name: g.label,
    value: g.id,
  }));

  let selectedGroupId = initialGroupId;
  if (!selectedGroupId) {
    selectedGroupId = await select({
      message: translate("menu_what_to_do", lang),
      choices: groupChoices,
    });
  }

  if (selectedGroupId === "exit") {
    console.log(`\n${translate("menu_goodbye", lang)} 👋\n`);
    process.exit(0);
  }

  const group = menuGroups.find((g: MenuGroup) => g.id === selectedGroupId);

  if (group?.action) {
    const code = await executeAction(group.action);
    if (code === 200) return renderMainMenu();
    return;
  }

  if (group?.items && group.items.length > 0) {
    const actionValue = await select({
      message: `${group.label.split("—")[0].trim()} — ${translate("menu_what_to_do_group", lang)}`,
      choices: group.items,
    });

    if (actionValue === "back") {
      return renderMainMenu();
    }

    const selectedItem = group.items.find((i: MenuItem) => i.value === actionValue);
    if (selectedItem?.action) {
      const code = await executeAction(selectedItem.action);
      if (code === 200) {
        return renderMainMenu(selectedGroupId);
      }
    }
  }
  
  return renderMainMenu();
}
