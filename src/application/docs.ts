import { execSync } from "node:child_process";
import { minimatch } from "minimatch";
import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";
import {
  buildDocsCreatePrompt,
  buildDocsUpdatePrompt,
  buildDocsManualUpdatePrompt,
} from "../prompts/docs.js";

interface DocsManifest {
  version: string;
  documents: Record<string, DocsManifestEntry>;
}

interface DocsManifestEntry {
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

function loadOrCreateManifest(gw: WorkspaceGateway, manifestPath: string): DocsManifest {
  if (gw.exists(manifestPath)) {
    try {
      return JSON.parse(gw.readFile(manifestPath)) as DocsManifest;
    } catch (e) {
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
    } catch (e) {
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

export function prepareDocsUpdatePrompt(
  gw: WorkspaceGateway,
  specName: string,
): DocsUpdateResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const specPath = PATHS.specFile(specName);
  if (!gw.exists(specPath)) {
    return { kind: "spec-not-found" };
  }

  if (!gw.exists(PATHS.docsUpdateRules)) {
    return { kind: "rules-not-found" };
  }

  // --- Check git ---
  if (!gw.exists(".git")) {
    return { kind: "no-git" };
  }

  // --- Get changed files via git diff ---
  let changedFiles: string[];
  try {
    const diffOutput = execSync("git diff HEAD --name-only", {
      encoding: "utf-8",
    }).trim();

    if (!diffOutput) {
      return { kind: "no-changed-files" };
    }

    changedFiles = diffOutput
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    return { kind: "no-changed-files" };
  }

  if (changedFiles.length === 0) {
    return { kind: "no-changed-files" };
  }

  // --- Load manifest and match scopes ---
  const manifest = loadOrCreateManifest(gw, PATHS.docsManifest);
  const affectedDocs: AffectedDoc[] = [];

  for (const [docName, entry] of Object.entries(manifest.documents)) {
    if (!entry.scope || entry.scope.length === 0) {
      continue;
    }

    const matchedFiles: string[] = [];

    for (const file of changedFiles) {
      for (const pattern of entry.scope) {
        if (minimatch(file, pattern)) {
          matchedFiles.push(file);
          break;
        }
      }
    }

    if (matchedFiles.length > 0) {
      affectedDocs.push({
        docName,
        docPath: entry.path,
        specPaths: entry.specs,
        matchedFiles,
      });
    }
  }

  if (affectedDocs.length === 0) {
    return { kind: "no-affected-docs" };
  }

  return { kind: "affected-docs", affectedDocs };
}

export function buildDocUpdatePrompt(
  gw: WorkspaceGateway,
  specName: string,
  affectedDoc: AffectedDoc,
): string {
  const rulesContent = gw.readFile(PATHS.docsUpdateRules);

  let changedFilesDiff = "";
  for (const file of affectedDoc.matchedFiles) {
    try {
      const diff = execSync(`git diff HEAD -- "${file}"`, {
        encoding: "utf-8",
      }).trim();
      if (diff) {
        changedFilesDiff += `\n### File: ${file}\n\`\`\`diff\n${diff}\n\`\`\`\n`;
      }
    } catch {
      changedFilesDiff += `\n### File: ${file}\n(Could not read diff)\n`;
    }
  }

  const newSpecRelPath = PATHS.specFile(specName);
  return buildDocsUpdatePrompt(affectedDoc, rulesContent, changedFilesDiff, newSpecRelPath);
}

export function prepareManualDocUpdate(
  gw: WorkspaceGateway,
  specName: string,
  docName: string,
): ManualDocUpdateResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const specPath = PATHS.specFile(specName);
  if (!gw.exists(specPath)) {
    return { kind: "spec-not-found" };
  }

  if (!gw.exists(PATHS.docsUpdateRules)) {
    return { kind: "rules-not-found" };
  }

  const manifest = loadOrCreateManifest(gw, PATHS.docsManifest);
  const manifestEntry = manifest.documents[docName];

  const docFilePath = `${PATHS.docsDir}/${docName}.md`;
  if (!manifestEntry && !gw.exists(docFilePath)) {
    return { kind: "doc-not-found" };
  }

  const doc: AffectedDoc = {
    docName,
    docPath: manifestEntry?.path ?? `.codeforge/docs/${docName}.md`,
    specPaths: manifestEntry?.specs ?? [],
    matchedFiles: [],
  };

  return { kind: "doc", doc };
}

export function buildDocManualUpdatePrompt(
  gw: WorkspaceGateway,
  specName: string,
  doc: AffectedDoc,
): string {
  const rulesContent = gw.readFile(PATHS.docsUpdateRules);
  return buildDocsManualUpdatePrompt(doc, rulesContent, specName);
}
