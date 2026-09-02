import { planningRule } from "../../infrastructure/assets/rules/planning.js";
import { runningRule } from "../../infrastructure/assets/rules/running.js";
import { docsRule, docsUpdateRule } from "../../infrastructure/assets/rules/docs.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

const SUBDIRECTORIES = ["specs", "tasks", "executions", "rules", "docs"];

interface WorkspaceMetadata {
  initialized: boolean;
  version: string;
  initializedAt: string;
}

export type InitResult =
  | { kind: "already-initialized" }
  | { kind: "created"; created: string[] };

export class InitializeWorkspaceUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(): InitResult {
    if (this.gw.exists(PATHS.metadata)) {
      const raw = this.gw.readFile(PATHS.metadata);
    const metadata = JSON.parse(raw) as WorkspaceMetadata;
    if (metadata.initialized) {
      return { kind: "already-initialized" };
    }
  }

    const created: string[] = [];

    if (!this.gw.exists(".codeforge")) {
      this.gw.mkdir(".codeforge");
      created.push(`.codeforge/`);
    }

    if (!this.gw.exists(PATHS.config)) {
      const configContent = `version: "1.0"\n`;
      this.gw.writeFile(PATHS.config, configContent);
      created.push(PATHS.config);
    }

    for (const sub of SUBDIRECTORIES) {
      const dirPath = `.codeforge/${sub}`;
      if (!this.gw.exists(dirPath)) {
        this.gw.mkdir(dirPath);
        created.push(`${dirPath}/`);
      }
    }

    // Write planning rules
    this.gw.writeFile(PATHS.planningRules, planningRule);
    created.push(PATHS.planningRules);

    // Write running rules
    this.gw.writeFile(PATHS.runningRules, runningRule);
    created.push(PATHS.runningRules);

    // Write docs rules
    this.gw.writeFile(PATHS.docsRules, docsRule);
    created.push(PATHS.docsRules);

    // Write docs-update rules
    this.gw.writeFile(PATHS.docsUpdateRules, docsUpdateRule);
    created.push(PATHS.docsUpdateRules);

    // Write docs/manifest.json
    if (!this.gw.exists(PATHS.docsManifest)) {
      const docsManifestContent = JSON.stringify({ version: "1.0", documents: {} }, null, 2);
      this.gw.writeFile(PATHS.docsManifest, docsManifestContent);
      created.push(PATHS.docsManifest);
    }

    // Written last — signals that initialization completed successfully.
    const metadata: WorkspaceMetadata = {
      initialized: true,
      version: "1.0",
      initializedAt: new Date().toISOString(),
    };
    this.gw.writeFile(PATHS.metadata, JSON.stringify(metadata, null, 2));
    created.push(PATHS.metadata);

    return { kind: "created", created };
  }
}

