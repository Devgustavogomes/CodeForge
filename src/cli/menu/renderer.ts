import { select } from "@inquirer/prompts";
import { menuGroups } from "./registry.js";
import { executeAction } from "./executor.js";
import { MenuGroup, MenuItem } from "./types.js";

export async function renderMainMenu(): Promise<void> {
  console.log("\nWelcome to CodeForge! 🚀");
  console.log("Selecione um grupo de comandos:\n");

  const groupChoices = menuGroups.map((g: MenuGroup) => ({
    name: g.label,
    value: g.id,
  }));

  const selectedGroupId = await select({
    message: "O que deseja fazer?",
    choices: groupChoices,
  });

  if (selectedGroupId === "exit") {
    console.log("\nGoodbye! 👋\n");
    process.exit(0);
  }

  const group = menuGroups.find((g: MenuGroup) => g.id === selectedGroupId);

  if (group?.action) {
    await executeAction(group.action);
    return;
  }

  if (group?.items && group.items.length > 0) {
    const actionValue = await select({
      message: `${group.label.split("—")[0].trim()} — o que deseja fazer?`,
      choices: group.items,
    });

    if (actionValue === "back") {
      return renderMainMenu();
    }

    const selectedItem = group.items.find((i: MenuItem) => i.value === actionValue);
    if (selectedItem?.action) {
      await executeAction(selectedItem.action);
    }
  }
  
  return renderMainMenu();
}
