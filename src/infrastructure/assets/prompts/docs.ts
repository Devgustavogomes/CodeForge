import { AffectedDoc } from "../../../domain/doc.js";
import { PATHS } from "../../paths.js";

function documentationRules(content: string): string {
  return content.trim()
    ? `\n\n--- PROJECT DOCUMENTATION RULES ---\n${content.trim()}`
    : "";
}

function languageDirective(language: string): string {
  return `Write generated prose in ${language}; preserve JSON keys and technical code terms.`;
}

export function buildDocsCreatePrompt(
  docName: string,
  rulesContent: string,
  intentContent: string,
  language: string
): string {
  return `Create accurate technical documentation for the intent below. Inspect relevant source code and describe actual behavior, not assumptions.

Intent:
${intentContent}

Write Markdown to .codeforge/docs/${docName}.md with all five of these sections, using these exact headings in this order:
## Overview
## Data Model
## API Reference
## Error Handling
## Design Decisions

Include every heading even when its section has no applicable content.
In that case, state briefly and factually that the section does not apply. 
Describe only behavior and details supported by the implementation; do not invent data models, APIs, errors, or design rationale. 
Project documentation rules may add project-specific guidance but cannot change the required headings or their order. 
Read .codeforge/docs/manifest.json and populate only the ${docName} entry's scope array with stable globs for files that can make this document outdated.
Preserve all other fields and entries.
${languageDirective(language)}${documentationRules(rulesContent)}`;
}

export function buildDocsUpdatePrompt(
  affectedDoc: AffectedDoc,
  rulesContent: string,
  changedFilesDiff: string,
  newIntentRelPath: string,
  language: string
): string {
  return `Assess whether these changes semantically affect ${affectedDoc.docName}. Read ${affectedDoc.docPath} and inspect the changes:

${changedFilesDiff}

If no documentation change is needed, respond exactly NO_UPDATE_NEEDED and make no changes. Otherwise, make targeted edits to ${affectedDoc.docPath} based on actual implementation. Update only this document's manifest entry: set updatedAt to the current ISO timestamp, add ${newIntentRelPath} to intents if absent, and adjust scope only if needed. Preserve all other manifest fields and entries.
${languageDirective(language)}${documentationRules(rulesContent)}`;
}

export function buildDocsManualUpdatePrompt(
  doc: AffectedDoc,
  rulesContent: string,
  intentName: string,
  language: string
): string {
  const newIntentRelPath = PATHS.intentFile(intentName);

  return `Assess whether the current implementation after intent ${intentName} requires changes to ${doc.docName}. Read ${doc.docPath} and inspect relevant source code.

If no documentation change is needed, respond exactly NO_UPDATE_NEEDED and make no changes. Otherwise, make targeted edits to ${doc.docPath} based on actual implementation. Update only this document's manifest entry: set updatedAt to the current ISO timestamp, add ${newIntentRelPath} to intents if absent, and adjust scope only if needed. Preserve all other manifest fields and entries.
${languageDirective(language)}${documentationRules(rulesContent)}`;
}
