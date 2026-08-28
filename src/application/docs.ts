import fs from "node:fs";
import path from "node:path";

interface DocsManifest {
  version: string;
  documents: Record<string, DocsManifestEntry>;
}

interface DocsManifestEntry {
  path: string;
  spec: string;
  scope: string[];
  createdAt: string;
  updatedAt: string;
}

export function prepareDocsPrompt(workspacePath: string, specName: string) {
  const codeforgeRoot = path.join(workspacePath, ".codeforge");
  const metadataPath = path.join(codeforgeRoot, "metadata.json");
  const specPath = path.join(codeforgeRoot, "specs", `${specName}.md`);
  const rulesPath = path.join(codeforgeRoot, "rules", "docs.md");
  const docPath = path.join(codeforgeRoot, "docs", `${specName}.md`);
  const manifestPath = path.join(codeforgeRoot, "docs", "manifest.json");

  if (!fs.existsSync(metadataPath)) {
    return { notInitialized: true };
  }

  if (!fs.existsSync(specPath)) {
    return { specNotFound: true };
  }

  if (!fs.existsSync(rulesPath)) {
    return { rulesNotFound: true };
  }

  let alreadyExists = false;
  if (fs.existsSync(docPath)) {
    alreadyExists = true;
  } else if (fs.existsSync(manifestPath)) {
    const rawManifest = fs.readFileSync(manifestPath, "utf-8");
    try {
      const manifest = JSON.parse(rawManifest) as DocsManifest;
      if (manifest?.documents?.[specName]) {
        alreadyExists = true;
      }
    } catch (e) {
      // Ignored
    }
  }

  if (alreadyExists) {
    return { alreadyExists: true };
  }

  // --- Deterministic manifest entry creation ---
  const manifest = loadOrCreateManifest(manifestPath);
  const now = new Date().toISOString();

  manifest.documents[specName] = {
    path: `.codeforge/docs/${specName}.md`,
    spec: `.codeforge/specs/${specName}.md`,
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
3. Write the documentation in Markdown format and output it to \`.codeforge/docs/${specName}.md\`.
4. Determine the \`scope\` of the documentation. The scope should be an array of glob patterns representing the project paths whose contents, if modified, might render this documentation outdated. Prefer stable glob patterns over listing individual files. For example:
   \`"scope": ["src/todo/**", "src/routes/todo.ts"]\`
   Ensure the scope considers the semantic relationship between the code and documentation.
5. The manifest entry for \`${specName}\` has already been created at \`.codeforge/docs/manifest.json\`. You must read the file, populate the \`scope\` array for the \`${specName}\` entry with your determined scope globs, and write the file back. Do NOT modify any other fields or entries in the manifest.

Please proceed with your analysis and file generation.`;

  return { prompt };
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

