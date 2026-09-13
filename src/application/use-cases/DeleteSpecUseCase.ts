import { PATHS } from "../../infrastructure/paths.js";
import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";

export type DeleteSpecResult =
  | { kind: "not-initialized" }
  | { kind: "spec-not-found" }
  | { kind: "deleted"; specName: string };

export class DeleteSpecUseCase {
  constructor(
    private readonly workspace: WorkspaceGateway,
    private readonly docsManifestRepository: DocsManifestRepository,
  ) {}

  execute(specName: string): DeleteSpecResult {
    if (!this.workspace.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const specPath = PATHS.specFile(specName);
    if (!this.workspace.exists(specPath)) {
      return { kind: "spec-not-found" };
    }

    this.workspace.deleteFile(specPath);
    this.workspace.deleteDir(`${PATHS.tasksDir}/${specName}`);
    this.workspace.deleteFile(PATHS.executionState(specName));

    if (this.workspace.exists(PATHS.plansDir)) {
      const planPrefix = `${specName}.`;

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
      entry.specs = entry.specs.filter((associatedSpec) => associatedSpec !== specPath);
    }
    this.docsManifestRepository.save(manifest);

    return { kind: "deleted", specName };
  }
}
