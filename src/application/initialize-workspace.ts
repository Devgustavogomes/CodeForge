import fs from "node:fs";
import path from "node:path";

const CODEFORGE_DIR = ".codeforge";
const METADATA_FILE = "metadata.json";

const SUBDIRECTORIES = ["specs", "plans", "tasks", "executions", "rules"];

const DEFAULT_CONFIG = `# CodeForge Configuration
version: "1.0"
`;

interface WorkspaceMetadata {
  initialized: boolean;
  version: string;
  initializedAt: string;
}

export interface InitResult {
  alreadyInitialized: boolean;
  created: string[];
}

export function initializeWorkspace(workspacePath: string): InitResult {
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
    fs.mkdirSync(codeforgeRoot);
    created.push(`${CODEFORGE_DIR}/`);
  }

  const configPath = path.join(codeforgeRoot, "config.yaml");
  fs.writeFileSync(configPath, DEFAULT_CONFIG, "utf-8");
  created.push(`${CODEFORGE_DIR}/config.yaml`);

  for (const sub of SUBDIRECTORIES) {
    const dirPath = path.join(codeforgeRoot, sub);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      created.push(`${CODEFORGE_DIR}/${sub}/`);
    }
  }

  const metadata: WorkspaceMetadata = {
    initialized: true,
    version: "1.0",
    initializedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  created.push(`${CODEFORGE_DIR}/metadata.json`);

  return { alreadyInitialized: false, created };
}
