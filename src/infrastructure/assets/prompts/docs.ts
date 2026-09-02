import { AffectedDoc } from "../../../domain/doc.js";

export function buildDocsCreatePrompt(
  docName: string,
  rulesContent: string,
  specContent: string,
  language: string
): string {
  return `SYSTEM PROMPT FOR AI AGENT (CodeForge Documentation)

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

Please proceed with your analysis and file generation.

--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.`;
}

export function buildDocsUpdatePrompt(
  affectedDoc: AffectedDoc,
  rulesContent: string,
  changedFilesDiff: string,
  newSpecRelPath: string,
  language: string
): string {
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

Please proceed with your evaluation.

--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.`;
}

import { PATHS } from "../../paths.js";

export function buildDocsManualUpdatePrompt(
  doc: AffectedDoc,
  rulesContent: string,
  specName: string,
  language: string
): string {
  const newSpecRelPath = PATHS.specFile(specName);

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

Please proceed with your evaluation.

--- INSTRUCTION ---
All your output, documentation, and task descriptions MUST be written in ${language}.`;
}
