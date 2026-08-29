import { renderMainMenu } from "./menu/renderer.js";

export async function runInteractiveMenu(): Promise<void> {
  return renderMainMenu();
}
