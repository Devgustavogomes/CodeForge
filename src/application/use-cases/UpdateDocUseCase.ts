import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { GitGateway } from "../../infrastructure/git/GitGateway.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { CodeForgeConfig } from "../../config/types.js";
import { PATHS } from "../../infrastructure/paths.js";
import { minimatch } from "minimatch";
import { buildDocsUpdatePrompt, buildDocsManualUpdatePrompt } from "../../prompts/docs.js";
import { loadOrCreateManifest, AffectedDoc, DocsUpdateResult, ManualDocUpdateResult } from "../docs.js";
import fs from "node:fs";

export class UpdateDocUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly git: GitGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig
  ) {}

  public getAffectedDocs(specName: string): DocsUpdateResult {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const specPath = PATHS.specFile(specName);
    if (!this.gw.exists(specPath)) return { kind: "spec-not-found" };
    if (!this.gw.exists(PATHS.docsUpdateRules)) return { kind: "rules-not-found" };
    if (!this.git.hasRepository()) return { kind: "no-git" };

    const changedFiles = this.git.getChangedFiles();
    if (changedFiles.length === 0) return { kind: "no-changed-files" };

    const manifest = loadOrCreateManifest(this.gw, PATHS.docsManifest);
    const affectedDocs: AffectedDoc[] = [];

    for (const [docName, entry] of Object.entries(manifest.documents)) {
      if (!entry.scope || entry.scope.length === 0) continue;

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

    if (affectedDocs.length === 0) return { kind: "no-affected-docs" };
    return { kind: "affected-docs", affectedDocs };
  }

  public getManualDoc(specName: string, docName: string): ManualDocUpdateResult {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const specPath = PATHS.specFile(specName);
    if (!this.gw.exists(specPath)) return { kind: "spec-not-found" };
    if (!this.gw.exists(PATHS.docsUpdateRules)) return { kind: "rules-not-found" };

    const manifest = loadOrCreateManifest(this.gw, PATHS.docsManifest);
    const manifestEntry = manifest.documents[docName];

    const docFilePath = `${PATHS.docsDir}/${docName}.md`;
    if (!manifestEntry && !this.gw.exists(docFilePath)) {
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

  public async execute(specName: string, doc: AffectedDoc, isManual: boolean = false): Promise<void> {
    const rulesContent = this.gw.readFile(PATHS.docsUpdateRules);
    let promptStr = "";

    if (isManual) {
      promptStr = buildDocsManualUpdatePrompt(doc, rulesContent, specName);
    } else {
      let changedFilesDiff = "";
      for (const file of doc.matchedFiles) {
        const diff = this.git.getFileDiff(file);
        if (diff) {
          changedFilesDiff += `\n### File: ${file}\n\`\`\`diff\n${diff}\n\`\`\`\n`;
        } else {
          changedFilesDiff += `\n### File: ${file}\n(Could not read diff)\n`;
        }
      }
      const newSpecRelPath = PATHS.specFile(specName);
      promptStr = buildDocsUpdatePrompt(doc, rulesContent, changedFilesDiff, newSpecRelPath);
    }

    const docsDir = ".codeforge/docs";
    if (!this.gw.exists(docsDir)) {
      this.gw.mkdir(docsDir);
    }
    const promptPath = `${docsDir}/${doc.docName}-update.temp.prompt.md`;
    this.gw.writeFile(promptPath, promptStr);

    const context: TaskContext = {
      promptFilePath: promptPath,
      specName,
      model: this.config.plannerAgent,
      silent: true,
    };

    try {
      await this.runner.execute(context);
    } finally {
      if (fs.existsSync(promptPath)) {
        fs.unlinkSync(promptPath);
      }
    }
  }
}
