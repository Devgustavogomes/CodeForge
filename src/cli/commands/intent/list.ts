import { Command } from "commander";
import { createAppContainer } from "../../../infrastructure/container.js";
import { IntentStatus } from "../../../application/use-cases/ListIntentsUseCase.js";
import { translate } from "../../ui/i18n.js";
import { SupportedLanguage } from "../../../config/types.js";

function getStatusLabel(status: IntentStatus, language: SupportedLanguage): string {
  switch (status) {
    case "completed":
      return translate("intent_list_status_completed", language);
    case "in_progress":
      return translate("intent_list_status_in_progress", language);
    case "planned":
      return translate("intent_list_status_planned", language);
    case "not_started":
      return translate("intent_list_status_not_started", language);
  }
}

function getStatusBadge(status: IntentStatus, language: SupportedLanguage): string {
  const label = getStatusLabel(status, language);
  switch (status) {
    case "completed":
      return `\x1b[32m✓ ${label}\x1b[0m`;
    case "in_progress":
      return `\x1b[36m▶ ${label}\x1b[0m`;
    case "planned":
      return `\x1b[33m○ ${label}\x1b[0m`;
    case "not_started":
      return `\x1b[90m○ ${label}\x1b[0m`;
  }
}

export function registerIntentListCommand(intent: Command): void {
  intent
    .command("list")
    .alias("ls")
    .description("List all local intents and their execution status")
    .action(async () => {
      const container = createAppContainer();
      const config = container.configService.loadConfig();
      const lang = (config?.language || "en") as SupportedLanguage;

      const useCase = container.listIntentsUseCase ?? container.listIntentsUseCase;
      const intents = useCase.execute();

      if (intents.length === 0) {
        console.log(translate("intent_list_empty", lang));
        return;
      }

      const headerName = translate("intent_list_header_name", lang);
      const headerTitle = translate("intent_list_header_title", lang);
      const headerStatus = translate("intent_list_header_status", lang);

      const nameWidth = Math.max(headerName.length, ...intents.map((s) => s.name.length)) + 2;
      const titleWidth = Math.max(headerTitle.length, ...intents.map((s) => s.title.length)) + 2;

      console.log("");
      console.log(
        `  \x1b[1m${headerName.padEnd(nameWidth)}  ${headerTitle.padEnd(titleWidth)}  ${headerStatus}\x1b[0m`
      );
      console.log(
        `  \x1b[2m${"─".repeat(nameWidth)}  ${"─".repeat(titleWidth)}  ${"─".repeat(headerStatus.length + 8)}\x1b[0m`
      );

      for (const s of intents) {
        console.log(
          `  ${s.name.padEnd(nameWidth)}  ${s.title.padEnd(titleWidth)}  ${getStatusBadge(s.status, lang)}`
        );
      }
      console.log("");
    });
}