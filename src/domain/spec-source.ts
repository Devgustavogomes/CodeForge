export interface SpecReference {
  id: string;
  title: string;
  url?: string;
  status?: string;
  [key: string]: unknown;
}

export interface FetchedSpec {
  id: string;
  title: string;
  description: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface SpecSourceConfig {
  provider: string;
  apiKeyEnv?: string;
  team?: string;
  project?: string;
  [key: string]: unknown;
}
