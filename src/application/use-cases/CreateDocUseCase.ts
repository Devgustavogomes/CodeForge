import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { CodeForgeConfig } from "../../config/types.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { buildDocsCreatePrompt } from "../../infrastructure/assets/prompts/docs.js";

import { PATHS } from "../../infrastructure/paths.js";

export type CreateDocResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "rules-not-found" }
  | { kind: "already-exists" }
  | { kind: "success" };

export class CreateDocUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig,
  ) {}

  async execute(docName: string, intentName: string): Promise<CreateDocResult> {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const intentPath = PATHS.intentFile(intentName);
    if (!this.gw.exists(intentPath)) return { kind: "intent-not-found" };
    if (!this.gw.exists(PATHS.docsRules)) return { kind: "rules-not-found" };

    const docPath = `${PATHS.docsDir}/${docName}.md`;
    let alreadyExists = false;
    if (this.gw.exists(docPath)) alreadyExists = true;
    else if (this.gw.exists(PATHS.docsManifest)) {
      const rawManifest = this.gw.readFile(PATHS.docsManifest);
      try {
        const manifest = JSON.parse(rawManifest) as {
          documents?: Record<string, unknown>;
        };
        if (manifest?.documents?.[docName]) alreadyExists = true;
      } catch {
        // ignore corrupted or invalid manifest JSON
      }
    }

    if (alreadyExists) return { kind: "already-exists" };

    const manifestRepo = new DocsManifestRepository(this.gw);
    const manifest = manifestRepo.load();
    const now = new Date().toISOString();

    manifest.documents[docName] = {
      path: `.codeforge/docs/${docName}.md`,
      intents: [PATHS.intentFile(intentName)],
      scope: [],
      createdAt: now,
      updatedAt: now,
    };

    manifestRepo.save(manifest);

    const rulesContent = this.gw.readFile(PATHS.docsRules);
    const intentContent = this.gw.readFile(intentPath);
    const promptStr = buildDocsCreatePrompt(
      docName,
      rulesContent,
      intentContent,
      this.config.language,
    );

    const docsDir = PATHS.docsDir;
    if (!this.gw.exists(docsDir)) {
      this.gw.mkdir(docsDir);
    }
    const promptPath = `${docsDir}/${docName}.prompt.md`;
    this.gw.writeFile(promptPath, promptStr);

    const context: TaskContext = {
      promptFilePath: promptPath,
      intentName,      model: this.config.plannerAgent,
      silent: true,
    };

    try {
      await this.runner.execute(context);
      return { kind: "success" };
    } finally {
      if (this.gw.exists(promptPath)) {
        this.gw.deleteFile(promptPath);
      }
    }
  }
}
