export interface DocsManifestEntry {
  path: string;
  specs: string[];
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
  specPaths: string[];
  matchedFiles: string[];
}
