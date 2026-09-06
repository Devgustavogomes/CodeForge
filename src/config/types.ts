import { HookMap } from "../domain/hook.js";
import { SpecSourceConfig } from "../domain/spec-source.js";

export type SupportedLanguage = "en" | "pt" | "es";

export interface CodeForgeConfig {
  environment: string;
  plannerAgent: string;
  executorAgent: string;
  language: SupportedLanguage;
  envPath?: string;
  hooks?: HookMap;
  specSource?: SpecSourceConfig;
}
