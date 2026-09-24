import { DocsManifestRepository } from "../../infrastructure/repositories/DocsManifestRepository.js";
import { PATHS } from "../../infrastructure/paths.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";

export type DeleteDocResult =
  | { kind: "not-initialized" }
  | { kind: "doc-not-found" }
  | { kind: "deleted"; docName: string };

export class DeleteDocUseCase {
  constructor(
    private readonly gw: WorkspaceGateway,
    private readonly manifestRepo: DocsManifestRepository,
  ) {}

  execute(docName: string): DeleteDocResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const manifest = this.manifestRepo.load();
    if (!Object.hasOwn(manifest.documents, docName)) {
      return { kind: "doc-not-found" };
    }

    const entry = manifest.documents[docName];
    if (this.gw.exists(entry.path)) {
      this.gw.deleteFile(entry.path);
    }

    const documents = { ...manifest.documents };
    delete documents[docName];
    this.manifestRepo.save({ ...manifest, documents });

    return { kind: "deleted", docName };
  }
}
