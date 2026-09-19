export interface IntentReference {
  id: string;
  title: string;
  url?: string;
  status?: string;
  [key: string]: unknown;
}

export interface FetchedIntent {
  id: string;
  title: string;
  description: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface IntentSourceConfig {
  provider: string;
  apiKey?: string;
  team?: string;
  project?: string;
  [key: string]: unknown;
}