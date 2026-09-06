import { FetchedSpec, SpecReference } from "../../domain/spec-source.js";

export interface ListSpecOptions {
  limit?: number;
  status?: string;
}

export interface SpecSource {
  readonly name: string;
  list(options?: ListSpecOptions): Promise<SpecReference[]>;
  fetch(id: string): Promise<FetchedSpec>;
}
