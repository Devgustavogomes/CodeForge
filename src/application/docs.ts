import { GitGateway } from "../infrastructure/git/GitGateway.js";
import { minimatch } from "minimatch";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";
import {
  buildDocsCreatePrompt,
  buildDocsUpdatePrompt,
  buildDocsManualUpdatePrompt,
} from "../prompts/docs.js";

export interface DocsManifest {
  version: string;
  documents: Record<string, DocsManifestEntry>;
}

export interface DocsManifestEntry {
  path: string;
  specs: string[];
  scope: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AffectedDoc {
  docName: string;
  docPath: string;
  specPaths: string[];
  matchedFiles: string[];
}

export type DocsPromptResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "rules-not-found" }
  | { kind: "already-exists" }
  | { kind: "prompt"; prompt: string };

export type DocsUpdateResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "rules-not-found" }
  | { kind: "no-git" }
  | { kind: "no-changed-files" }
  | { kind: "no-affected-docs" }
  | { kind: "affected-docs"; affectedDocs: AffectedDoc[] };

export type ManualDocUpdateResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "rules-not-found" }
  | { kind: "doc-not-found" }
  | { kind: "doc"; doc: AffectedDoc };

export function loadOrCreateManifest(gw: WorkspaceGateway, manifestPath: string): DocsManifest {
  if (gw.exists(manifestPath)) {
    try {
      return JSON.parse(gw.readFile(manifestPath)) as DocsManifest;
    } catch {
      // Corrupted file, recreate
    }
  }
  return { version: "1.0", documents: {} };
}

export function prepareDocsPrompt(gw: WorkspaceGateway, docName: string, specName: string): DocsPromptResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const specPath = PATHS.specFile(specName);
  if (!gw.exists(specPath)) {
    return { kind: "spec-not-found" };
  }

  if (!gw.exists(PATHS.docsRules)) {
    return { kind: "rules-not-found" };
  }

  const docPath = `${PATHS.docsDir}/${docName}.md`;
  let alreadyExists = false;
  if (gw.exists(docPath)) {
    alreadyExists = true;
  } else if (gw.exists(PATHS.docsManifest)) {
    const rawManifest = gw.readFile(PATHS.docsManifest);
    try {
      const manifest = JSON.parse(rawManifest) as DocsManifest;
      if (manifest?.documents?.[docName]) {
        alreadyExists = true;
      }
    } catch {
      // Ignored
    }
  }

  if (alreadyExists) {
    return { kind: "already-exists" };
  }

  // --- Deterministic manifest entry creation ---
  const manifest = loadOrCreateManifest(gw, PATHS.docsManifest);
  const now = new Date().toISOString();

  manifest.documents[docName] = {
    path: `.codeforge/docs/${docName}.md`,
    specs: [`.codeforge/specs/${specName}.md`],
    scope: [],
    createdAt: now,
    updatedAt: now,
  };

  gw.writeFile(PATHS.docsManifest, JSON.stringify(manifest, null, 2));

  // --- Build prompt ---
  const rulesContent = gw.readFile(PATHS.docsRules);
  const specContent = gw.readFile(specPath);

  const prompt = buildDocsCreatePrompt(docName, rulesContent, specContent);
  return { kind: "prompt", prompt };
}


