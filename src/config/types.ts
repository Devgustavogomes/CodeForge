import { HookMap } from "../domain/hook.js";
import { IntentSourceConfig } from "../domain/intent-source.js";

export type SupportedLanguage = "en" | "pt" | "es";

export interface CodeForgeConfig {
  environment: string;
  plannerAgent: string;
  executorAgent: string;
  language: SupportedLanguage;
  envPath?: string;
  hooks?: HookMap;
  intentSource?: IntentSourceConfig;
  externalTerminal?: boolean;
}
