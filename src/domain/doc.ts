export interface DocsManifestEntry {
  path: string;
  intents: string[];
  scope: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocsManifest {
  version: string;
  documents: Record<string, DocsManifestEntry>;
}

export interface AffectedDoc {
  docName: string;
  docPath: string;
  intentPaths: string[];
  matchedFiles: string[];
}
