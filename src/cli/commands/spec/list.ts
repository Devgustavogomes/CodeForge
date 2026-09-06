import { Command } from "commander";
import { NodeWorkspaceGateway } from "../../../infrastructure/workspace.js";
import { ConfigService } from "../../../config/ConfigService.js";
import { ListSpecsUseCase, SpecStatus } from "../../../application/use-cases/ListSpecsUseCase.js";
import { translate } from "../../ui/i18n.js";
import { SupportedLanguage } from "../../../config/types.js";

function getStatusLabel(status: SpecStatus, language: SupportedLanguage): string {
  switch (status) {
    case "completed":
      return translate("spec_list_status_completed", language);
    case "in_progress":
      return translate("spec_list_status_in_progress", language);
    case "planned":
      return translate("spec_list_status_planned", language);
    case "not_started":
      return translate("spec_list_status_not_started", language);
  }
}

function getStatusBadge(status: SpecStatus, language: SupportedLanguage): string {
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

export function registerSpecListCommand(spec: Command): void {
  spec
    .command("list")
    .alias("ls")
    .description("List all local specifications and their execution status")
    .action(async () => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      const configService = new ConfigService(gw);
      const config = configService.loadConfig();
      const lang = (config?.language || "en") as SupportedLanguage;

      const useCase = new ListSpecsUseCase(gw);
      const specs = useCase.execute();

      if (specs.length === 0) {
        console.log(translate("spec_list_empty", lang));
        return;
      }

      const headerName = translate("spec_list_header_name", lang);
      const headerTitle = translate("spec_list_header_title", lang);
      const headerStatus = translate("spec_list_header_status", lang);

      const nameWidth = Math.max(headerName.length, ...specs.map((s) => s.name.length)) + 2;
      const titleWidth = Math.max(headerTitle.length, ...specs.map((s) => s.title.length)) + 2;

      console.log("");
      console.log(
        `  \x1b[1m${headerName.padEnd(nameWidth)}  ${headerTitle.padEnd(titleWidth)}  ${headerStatus}\x1b[0m`
      );
      console.log(
        `  \x1b[2m${"─".repeat(nameWidth)}  ${"─".repeat(titleWidth)}  ${"─".repeat(headerStatus.length + 8)}\x1b[0m`
      );

      for (const s of specs) {
        console.log(
          `  ${s.name.padEnd(nameWidth)}  ${s.title.padEnd(titleWidth)}  ${getStatusBadge(s.status, lang)}`
        );
      }
      console.log("");
    });
}
