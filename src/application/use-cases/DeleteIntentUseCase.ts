import { PATHS } from "../../infrastructure/paths.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";

export type DeleteIntentResult =
  | { kind: "not-initialized" }
  | { kind: "intent-not-found" }
  | { kind: "deleted"; intentName: string };

export class DeleteIntentUseCase {
  constructor(
    private readonly workspace: WorkspaceGateway,
    private readonly docsManifestRepository: DocsManifestRepository,
  ) {}

  execute(intentName: string): DeleteIntentResult {
    if (!this.workspace.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const intentPath = PATHS.intentFile(intentName);
    if (!this.workspace.exists(intentPath)) {
      return { kind: "intent-not-found" };
    }

    this.workspace.deleteFile(intentPath);
    this.workspace.deleteDir(`${PATHS.tasksDir}/${intentName}`);
    this.workspace.deleteFile(PATHS.executionState(intentName));
    this.workspace.deleteDir(`${PATHS.executionsDir}/${intentName}`);

    if (this.workspace.exists(PATHS.plansDir)) {
      const planPrefix = `${intentName}.`;

      for (const fileName of this.workspace.listDir(PATHS.plansDir)) {
        if (
          fileName.length >= planPrefix.length + ".md".length &&
          fileName.startsWith(planPrefix) &&
          fileName.endsWith(".md")
        ) {
          this.workspace.deleteFile(`${PATHS.plansDir}/${fileName}`);
        }
      }
    }

    const manifest = this.docsManifestRepository.load();
    for (const entry of Object.values(manifest.documents)) {
      if (entry.intents) {
        entry.intents = entry.intents.filter((associatedIntent) => associatedIntent !== intentPath);
      }
    }
    this.docsManifestRepository.save(manifest);

    return { kind: "deleted", intentName };
  }
}
