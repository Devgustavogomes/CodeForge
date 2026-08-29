import fs from "node:fs";
import path from "node:path";
import { planningRule } from "../rules/planning.js";
import { runningRule } from "../rules/running.js";
import { docsRule, docsUpdateRule } from "../rules/docs.js";

const CODEFORGE_DIR = ".codeforge";
const METADATA_FILE = "metadata.json";

const SUBDIRECTORIES = ["specs", "tasks", "executions", "rules", "docs"];

interface WorkspaceMetadata {
  initialized: boolean;
  version: string;
  initializedAt: string;
}

export interface InitResult {
  alreadyInitialized: boolean;
  created: string[];
}

export function initializeWorkspace(
  workspacePath: string,
): InitResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const metadataPath = path.join(codeforgeRoot, METADATA_FILE);

  if (fs.existsSync(metadataPath)) {
    const raw = fs.readFileSync(metadataPath, "utf-8");
    const metadata = JSON.parse(raw) as WorkspaceMetadata;
    if (metadata.initialized) {
      return { alreadyInitialized: true, created: [] };
    }
  }

  const created: string[] = [];

  if (!fs.existsSync(codeforgeRoot)) {
    fs.mkdirSync(codeforgeRoot, { recursive: true });
    created.push(`${CODEFORGE_DIR}/`);
  }

  const configPath = path.join(codeforgeRoot, "config.yaml");
  if (!fs.existsSync(configPath)) {
    const configContent = `version: "1.0"\n`;
    fs.writeFileSync(configPath, configContent, "utf-8");
    created.push(`${CODEFORGE_DIR}/config.yaml`);
  }

  for (const sub of SUBDIRECTORIES) {
    const dirPath = path.join(codeforgeRoot, sub);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      created.push(`${CODEFORGE_DIR}/${sub}/`);
    }
  }

  // Write planning rules
  const planningRulesPath = path.join(codeforgeRoot, "rules", "planning.md");
  fs.writeFileSync(planningRulesPath, planningRule, "utf-8");
  created.push(`${CODEFORGE_DIR}/rules/planning.md`);

  // Write running rules
  const runningRulesPath = path.join(codeforgeRoot, "rules", "running.md");
  fs.writeFileSync(runningRulesPath, runningRule, "utf-8");
  created.push(`${CODEFORGE_DIR}/rules/running.md`);

  // Write docs rules
  const docsRulesPath = path.join(codeforgeRoot, "rules", "docs.md");
  fs.writeFileSync(docsRulesPath, docsRule, "utf-8");
  created.push(`${CODEFORGE_DIR}/rules/docs.md`);

  // Write docs-update rules
  const docsUpdateRulesPath = path.join(codeforgeRoot, "rules", "docs-update.md");
  fs.writeFileSync(docsUpdateRulesPath, docsUpdateRule, "utf-8");
  created.push(`${CODEFORGE_DIR}/rules/docs-update.md`);

  // Write docs/manifest.json
  const docsManifestPath = path.join(codeforgeRoot, "docs", "manifest.json");
  if (!fs.existsSync(docsManifestPath)) {
    const docsManifestContent = JSON.stringify({ version: "1.0", documents: {} }, null, 2);
    fs.writeFileSync(docsManifestPath, docsManifestContent, "utf-8");
    created.push(`${CODEFORGE_DIR}/docs/manifest.json`);
  }

  // Written last — signals that initialization completed successfully.
  const metadata: WorkspaceMetadata = {
    initialized: true,
    version: "1.0",
    initializedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  created.push(`${CODEFORGE_DIR}/metadata.json`);

  return { alreadyInitialized: false, created };
}

