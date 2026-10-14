import { PATHS } from "../../infrastructure/paths.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";

import { ExecutionStateRepository } from "../../infrastructure/repositories/ExecutionStateRepository.js";
import { intentMutationBlock, ProtectedOperationResult } from "./TaskStateProtection.js";

export type DeleteIntentResult =
  | ProtectedOperationResult
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

    return this.workspace.executionWorkspace().withFileLock(PATHS.executionLock(intentName),
      () => this.deleteArtifacts(intentName, intentPath));
  }

  private deleteArtifacts(intentName: string, intentPath: string): DeleteIntentResult {
    if (this.workspace.exists(PATHS.executionState(intentName))) {
      try {
        const state = new ExecutionStateRepository(this.workspace).load(intentName);
        if (state) {
          const block = intentMutationBlock(state);
          if (block) return block;
        }
      } catch {
        return { kind: "blocked", message: "Execution evidence cannot be read. Preserve the intent and repair or inspect its execution record before deletion." };
      }
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
