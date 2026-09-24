import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { CodeForgeConfig } from "../../config/types.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { buildDocsCreatePrompt } from "../../infrastructure/assets/prompts/docs.js";
import { executeWithTempPrompt } from "../services/PromptService.js";
import { PATHS } from "../../infrastructure/paths.js";

export type CreateDocResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "rules-not-found" }
  | { kind: "already-exists" }
  | { kind: "success" };

export class CreateDocUseCase {
  private readonly manifestRepo: DocsManifestRepository;

  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig,
    manifestRepo?: DocsManifestRepository,
  ) {
    this.manifestRepo = manifestRepo ?? new DocsManifestRepository(gw);
  }

  async execute(docName: string, intentName: string): Promise<CreateDocResult> {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const intentPath = PATHS.intentFile(intentName);
    if (!this.gw.exists(intentPath)) return { kind: "intent-not-found" };
    if (!this.gw.exists(PATHS.docsRules)) return { kind: "rules-not-found" };

    const docPath = `${PATHS.docsDir}/${docName}.md`;
    const manifest = this.manifestRepo.load();
    const alreadyExists = this.gw.exists(docPath) || Boolean(manifest.documents[docName]);
    if (alreadyExists) return { kind: "already-exists" };

    const now = new Date().toISOString();
    manifest.documents[docName] = {
      path: `.codeforge/docs/${docName}.md`,
      intents: [PATHS.intentFile(intentName)],
      scope: [],
      createdAt: now,
      updatedAt: now,
    };

    this.manifestRepo.save(manifest);

    const rulesContent = this.gw.readFile(PATHS.docsRules);
    const intentContent = this.gw.readFile(intentPath);
    const promptStr = buildDocsCreatePrompt(
      docName,
      rulesContent,
      intentContent,
      this.config.language,
    );

    const promptPath = `${PATHS.docsDir}/${docName}.prompt.md`;
    const context: TaskContext = {
      promptFilePath: promptPath,
      intentName,
      model: this.config.plannerAgent,
      silent: true,
    };

    await executeWithTempPrompt(this.gw, promptPath, promptStr, () =>
      this.runner.execute(context),
    );

    return { kind: "success" };
  }
}
