import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { AgentRunner, TaskContext } from "../../runners/AgentRunner.js";
import { CodeForgeConfig } from "../../config/types.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { buildDocsCreatePrompt } from "../../infrastructure/assets/prompts/docs.js";
import fs from "node:fs";
import { PATHS } from "../../infrastructure/paths.js";

export type CreateDocResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "rules-not-found" }
  | { kind: "already-exists" }
  | { kind: "success" };

export class CreateDocUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly runner: AgentRunner,
    private readonly config: CodeForgeConfig,
  ) {}

  async execute(docName: string, specName: string): Promise<CreateDocResult> {
    if (!this.gw.exists(PATHS.metadata)) return { kind: "not-initialized" };
    const specPath = PATHS.specFile(specName);
    if (!this.gw.exists(specPath)) return { kind: "spec-not-found" };
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
      specs: [`.codeforge/specs/${specName}.md`],
      scope: [],
      createdAt: now,
      updatedAt: now,
    };

    manifestRepo.save(manifest);

    const rulesContent = this.gw.readFile(PATHS.docsRules);
    const specContent = this.gw.readFile(specPath);
    const promptStr = buildDocsCreatePrompt(
      docName,
      rulesContent,
      specContent,
      this.config.language,
    );

    const docsDir = ".codeforge/docs";
    if (!this.gw.exists(docsDir)) {
      this.gw.mkdir(docsDir);
    }
    const promptPath = `${docsDir}/${docName}.prompt.md`;
    this.gw.writeFile(promptPath, promptStr);

    const context: TaskContext = {
      promptFilePath: promptPath,
      specName,
      model: this.config.plannerAgent,
      silent: true,
    };

    try {
      await this.runner.execute(context);
      return { kind: "success" };
    } finally {
      if (fs.existsSync(promptPath)) {
        fs.unlinkSync(promptPath);
      }
    }
  }
}
