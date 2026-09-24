import { FetchedIntent, IntentReference } from "../../domain/intent-source.js";

export interface ListIntentOptions {
  limit?: number;
  status?: string;
}

export interface IntentSource {
  readonly name: string;
  list(options?: ListIntentOptions): Promise<IntentReference[]>;
  fetch(id: string): Promise<FetchedIntent>;
}
