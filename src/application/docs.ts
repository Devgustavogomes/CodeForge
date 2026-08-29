import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { minimatch } from "minimatch";

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

export function prepareDocsPrompt(workspacePath: string, docName: string, specName: string): DocsPromptResult {
  const codeforgeRoot = path.join(workspacePath, ".codeforge");
  const metadataPath = path.join(codeforgeRoot, "metadata.json");
  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  const rulesPath = path.join(codeforgeRoot, "rules", "docs.md");
  const docPath = path.join(codeforgeRoot, "docs", `${docName}.md`);
  const manifestPath = path.join(codeforgeRoot, "docs", "manifest.json");

  if (!fs.existsSync(metadataPath)) {
    return { kind: "not-initialized" };
  }

  if (!fs.existsSync(specPath)) {
    return { kind: "spec-not-found" };
  }

  if (!fs.existsSync(rulesPath)) {
    return { kind: "rules-not-found" };
  }

  let alreadyExists = false;
  if (fs.existsSync(docPath)) {
    alreadyExists = true;
  } else if (fs.existsSync(manifestPath)) {
    const rawManifest = fs.readFileSync(manifestPath, "utf-8");
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
  const manifest = loadOrCreateManifest(manifestPath);
  const now = new Date().toISOString();

  manifest.documents[docName] = {
    path: `.codeforge/docs/${docName}.md`,
    specs: [`.codeforge/specs/${specName}.md`],
    scope: [],
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  // --- Build prompt (AI only writes doc + fills scope) ---
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");
  const specContent = fs.readFileSync(specPath, "utf-8");

  const prompt = `SYSTEM PROMPT FOR AI AGENT (CodeForge Documentation)

You are an expert technical writer and software architect. Your task is to analyze the provided specification and the relevant source code, and then write the initial documentation for it.

### Rules for Documentation
${rulesContent}

### Specification
${specContent}

### Instructions

1. Analyze the Specification above and read the relevant code in the workspace to understand how the feature was implemented. You must read the codebase to ensure the documentation reflects the *actual* implementation, not just the intent.
2. Determine what needs to be documented.
3. Write the documentation in Markdown format and output it to \`.codeforge/docs/${docName}.md\`.
4. Determine the \`scope\` of the documentation. The scope should be an array of glob patterns representing the project paths whose contents, if modified, might render this documentation outdated. Prefer stable glob patterns over listing individual files. For example:
   \`"scope": ["src/todo/**", "src/routes/todo.ts"]\`
   Ensure the scope considers the semantic relationship between the code and documentation.
5. The manifest entry for \`${docName}\` has already been created at \`.codeforge/docs/manifest.json\`. You must read the file, populate the \`scope\` array for the \`${docName}\` entry with your determined scope globs, and write the file back. Do NOT modify any other fields or entries in the manifest.

Please proceed with your analysis and file generation.`;

  return { kind: "prompt", prompt };
}

// --- Docs Update ---

export function prepareDocsUpdatePrompt(
  workspacePath: string,
  specName: string,
): DocsUpdateResult {
  const codeforgeRoot = path.join(workspacePath, ".codeforge");
  const metadataPath = path.join(codeforgeRoot, "metadata.json");
  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  const updateRulesPath = path.join(codeforgeRoot, "rules", "docs-update.md");
  const manifestPath = path.join(codeforgeRoot, "docs", "manifest.json");

  // --- Validations ---
  if (!fs.existsSync(metadataPath)) {
    return { kind: "not-initialized" };
  }

  if (!fs.existsSync(specPath)) {
    return { kind: "spec-not-found" };
  }

  if (!fs.existsSync(updateRulesPath)) {
    return { kind: "rules-not-found" };
  }

  // --- Check git ---
  const gitDir = path.join(workspacePath, ".git");
  if (!fs.existsSync(gitDir)) {
    return { kind: "no-git" };
  }

  // --- Get changed files via git diff ---
  let changedFiles: string[];
  try {
    const diffOutput = execSync("git diff HEAD --name-only", {
      cwd: workspacePath,
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
  const manifest = loadOrCreateManifest(manifestPath);
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
  workspacePath: string,
  specName: string,
  affectedDoc: AffectedDoc,
): string {
  const codeforgeRoot = path.join(workspacePath, ".codeforge");
  const updateRulesPath = path.join(codeforgeRoot, "rules", "docs-update.md");

  const rulesContent = fs.readFileSync(updateRulesPath, "utf-8");

  // Read git diff for changed files that matched scope
  let changedFilesDiff = "";
  for (const file of affectedDoc.matchedFiles) {
    try {
      const diff = execSync(`git diff HEAD -- "${file}"`, {
        cwd: workspacePath,
        encoding: "utf-8",
      }).trim();
      if (diff) {
        changedFilesDiff += `\n### File: ${file}\n\`\`\`diff\n${diff}\n\`\`\`\n`;
      }
    } catch {
      changedFilesDiff += `\n### File: ${file}\n(Could not read diff)\n`;
    }
  }

  const newSpecRelPath = `.codeforge/specs/${specName}.md`;

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Documentation Update)

You are an expert technical writer. Your task is to evaluate whether recent code changes require updating an existing documentation file, and if so, perform targeted incremental updates.

### Update Rules
${rulesContent}

### Existing Documentation (${affectedDoc.docName})
Read the current documentation at \`${affectedDoc.docPath}\`.

### Changed Files in Scope
The following files were modified and matched the scope of this documentation:
${changedFilesDiff}

### Instructions

1. Read the existing documentation at \`${affectedDoc.docPath}\` and analyze the diffs above.
2. **RELEVANCE CHECK**: Determine if the code changes semantically impact this documentation.
   - If the changes are purely internal refactoring, formatting, or do not affect the documented behavior/API/contracts, respond with ONLY: \`NO_UPDATE_NEEDED\`
   - If the changes DO affect the documented behavior, proceed to step 3.
3. Update the documentation at \`${affectedDoc.docPath}\` to reflect the current implementation. Make targeted, incremental changes — do NOT rewrite from scratch.
4. Update the \`updatedAt\` field for the \`${affectedDoc.docName}\` entry in \`.codeforge/docs/manifest.json\`.
5. If the update is relevant, add \`${newSpecRelPath}\` to the \`specs\` array of the \`${affectedDoc.docName}\` entry in the manifest (if not already present).
6. If the scope patterns need adjustment, update the \`scope\` array. Do NOT modify any other fields or entries.

Please proceed with your evaluation.`;
}

// --- Docs Manual Update (--doc <docname>) ---

export function prepareManualDocUpdate(
  workspacePath: string,
  specName: string,
  docName: string,
): ManualDocUpdateResult {
  const codeforgeRoot = path.join(workspacePath, ".codeforge");
  const metadataPath = path.join(codeforgeRoot, "metadata.json");
  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  const updateRulesPath = path.join(codeforgeRoot, "rules", "docs-update.md");
  const manifestPath = path.join(codeforgeRoot, "docs", "manifest.json");
  const docFilePath = path.join(codeforgeRoot, "docs", `${docName}.md`);

  if (!fs.existsSync(metadataPath)) {
    return { kind: "not-initialized" };
  }

  if (!fs.existsSync(specPath)) {
    return { kind: "spec-not-found" };
  }

  if (!fs.existsSync(updateRulesPath)) {
    return { kind: "rules-not-found" };
  }

  // Try to resolve doc from manifest first, then fall back to file existence
  const manifest = loadOrCreateManifest(manifestPath);
  const manifestEntry = manifest.documents[docName];

  if (!manifestEntry && !fs.existsSync(docFilePath)) {
    return { kind: "doc-not-found" };
  }

  const doc: AffectedDoc = {
    docName,
    docPath: manifestEntry?.path ?? `.codeforge/docs/${docName}.md`,
    specPaths: manifestEntry?.specs ?? [],
    matchedFiles: [], // not scope-based — AI reads the file directly
  };

  return { kind: "doc", doc };
}

export function buildDocManualUpdatePrompt(
  workspacePath: string,
  specName: string,
  doc: AffectedDoc,
): string {
  const codeforgeRoot = path.join(workspacePath, ".codeforge");
  const updateRulesPath = path.join(codeforgeRoot, "rules", "docs-update.md");

  const rulesContent = fs.readFileSync(updateRulesPath, "utf-8");
  const newSpecRelPath = `.codeforge/specs/${specName}.md`;

  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Documentation Update — Manual)

You are an expert technical writer. The user has explicitly requested an update to the documentation '${doc.docName}' following the execution of the spec '${specName}'.

### Update Rules
${rulesContent}

### Existing Documentation (${doc.docName})
Read the current documentation at \`${doc.docPath}\`.

### Instructions

1. Read the existing documentation at \`${doc.docPath}\` and the relevant source code in the workspace.
2. **RELEVANCE CHECK**: Determine if anything in the codebase (as it currently stands after running spec '${specName}') requires updating this documentation.
   - If the documentation is already up-to-date, respond with ONLY: \`NO_UPDATE_NEEDED\`
   - If updates are needed, proceed to step 3.
3. Update the documentation at \`${doc.docPath}\` to reflect the current implementation. Make targeted, incremental changes — do NOT rewrite from scratch.
4. Update the \`updatedAt\` field for the \`${doc.docName}\` entry in \`.codeforge/docs/manifest.json\`.
5. Add \`${newSpecRelPath}\` to the \`specs\` array of the \`${doc.docName}\` entry in the manifest (if not already present).
6. If the scope patterns need adjustment, update the \`scope\` array. Do NOT modify any other fields or entries.

Please proceed with your evaluation.`;
}

function loadOrCreateManifest(manifestPath: string): DocsManifest {
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as DocsManifest;
    } catch (e) {
      // Corrupted file, recreate
    }
  }
  return { version: "1.0", documents: {} };
}
