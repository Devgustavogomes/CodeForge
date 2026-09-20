import { HookMap } from "../domain/hook.js";
import { IntentSourceConfig } from "../domain/intent-source.js";

export type SupportedLanguage = "en" | "pt" | "es";

export interface AiReviewConfig {
  enabled: boolean;
  agent: string;
  maxRounds?: number;
}

export const DEFAULT_AI_REVIEW_CONFIG: Required<AiReviewConfig> = {
  enabled: false,
  agent: "default",
  maxRounds: 3,
};

/** Resolves review defaults without requiring legacy config files to be rewritten. */
export function resolveAiReviewConfig(
  config?: Partial<AiReviewConfig>,
): Required<AiReviewConfig> {
  return { ...DEFAULT_AI_REVIEW_CONFIG, ...config };
}

export interface CodeForgeConfig {
  environment: string;
  plannerAgent: string;
  executorAgent: string;
  language: SupportedLanguage;
  envPath?: string;
  hooks?: HookMap;
  intentSource?: IntentSourceConfig;
  externalTerminal?: boolean;
  aiReview?: AiReviewConfig;
}
