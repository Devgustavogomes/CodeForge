import { HookMap } from "../domain/hook.js";

export type SupportedLanguage = "en" | "pt" | "es";

export interface CodeForgeConfig {
  environment: string;
  plannerAgent: string;
  executorAgent: string;
  language: SupportedLanguage;
  hooks?: HookMap;
}
