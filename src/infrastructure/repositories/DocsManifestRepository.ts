import { DocsManifest } from "../../domain/doc.js";
import { WorkspaceGateway } from "../workspace.js";
import { PATHS } from "../paths.js";

export class DocsManifestRepository {
  constructor(private readonly gw: WorkspaceGateway) {}

  load(): DocsManifest {
    if (this.gw.exists(PATHS.docsManifest)) {
      try {
        return JSON.parse(this.gw.readFile(PATHS.docsManifest)) as DocsManifest;
      } catch {
        // Corrupted file, recreate
      }
    }
    return { version: "1.0", documents: {} };
  }

  save(manifest: DocsManifest): void {
    this.gw.writeFile(PATHS.docsManifest, JSON.stringify(manifest, null, 2));
  }
}
