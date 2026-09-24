import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { GitGateway } from "../../infrastructure/git/GitGateway.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { CodeForgeConfig } from "../../config/types.js";
import { PATHS } from "../../infrastructure/paths.js";
import { minimatch } from "minimatch";
import {
  buildDocsUpdatePrompt,
  buildDocsManualUpdatePrompt,
} from "../../infrastructure/assets/prompts/docs.js";
import { AffectedDoc } from "../../domain/doc.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { executeWithTempPrompt } from "../services/PromptService.js";
import { formatGitDiffSummary } from "../services/diff-formatter.js";

export type DocsUpdateResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "no-git" }
  | { kind: "no-changed-files" }
  | { kind: "no-affected-docs" }
  | { kind: "affected-docs"; affectedDocs: AffectedDoc[] };

export type ManualDocUpdateResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "doc-not-found" }
  | { kind: "doc"; doc: AffectedDoc };

export class UpdateDocUseCase {
  private readonly manifestRepo: DocsManifestRepository;

  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly git: GitGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig,
    manifestRepo?: DocsManifestRepository,
  ) {
    this.manifestRepo = manifestRepo ?? new DocsManifestRepository(gw);
  }

  public getAffectedDocs(intentName: string): DocsUpdateResult {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const intentPath = PATHS.intentFile(intentName);
    if (!this.gw.exists(intentPath)) return { kind: "intent-not-found" };
    if (!this.git.hasRepository()) return { kind: "no-git" };

    const changedFiles = this.git.getChangedFiles();
    if (changedFiles.length === 0) return { kind: "no-changed-files" };

    const manifest = this.manifestRepo.load();
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
          intentPaths: entry.intents,
          matchedFiles,
        });
      }
    }

    if (affectedDocs.length === 0) return { kind: "no-affected-docs" };

    return { kind: "affected-docs", affectedDocs };
  }

  public getManualDoc(intentName: string, docName: string): ManualDocUpdateResult {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const intentPath = PATHS.intentFile(intentName);
    if (!this.gw.exists(intentPath)) return { kind: "intent-not-found" };

    const manifest = this.manifestRepo.load();
    const manifestEntry = manifest.documents[docName];

    const docFilePath = `${PATHS.docsDir}/${docName}.md`;
    if (!manifestEntry && !this.gw.exists(docFilePath)) {
      return { kind: "doc-not-found" };
    }

    const doc: AffectedDoc = {
      docName,
      docPath: manifestEntry?.path ?? `.codeforge/docs/${docName}.md`,
      intentPaths: manifestEntry?.intents ?? [],
      matchedFiles: [],
    };

    return { kind: "doc", doc };
  }

  public async execute(
    intentName: string,
    doc: AffectedDoc,
    isManual: boolean = false,
  ): Promise<void> {
    const rulesContent = this.gw.exists(PATHS.docsUpdateRules)
      ? this.gw.readFile(PATHS.docsUpdateRules)
      : "";
    let promptStr: string;

    if (isManual) {
      promptStr = buildDocsManualUpdatePrompt(
        doc,
        rulesContent,
        intentName,
        this.config.language,
      );
    } else {
      const changedFilesDiff = formatGitDiffSummary(this.git, doc.matchedFiles);
      const newIntentRelPath = PATHS.intentFile(intentName);
      promptStr = buildDocsUpdatePrompt(
        doc,
        rulesContent,
        changedFilesDiff,
        newIntentRelPath,
        this.config.language,
      );
    }

    const promptPath = `${PATHS.docsDir}/${doc.docName}-update.temp.prompt.md`;
    const context: TaskContext = {
      promptFilePath: promptPath,
      intentName,
      model: this.config.plannerAgent,
      silent: true,
    };

    await executeWithTempPrompt(this.gw, promptPath, promptStr, () =>
      this.runner.execute(context),
    );
  }
}
