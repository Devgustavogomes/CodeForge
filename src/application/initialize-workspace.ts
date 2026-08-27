import fs from "node:fs";
import path from "node:path";

const CODEFORGE_DIR = ".codeforge";

const SUBDIRECTORIES = ["specs", "plans", "tasks", "executions", "rules"];

const DEFAULT_CONFIG = `# CodeForge Configuration
version: "1.0"
`;

export interface InitResult {
  alreadyInitialized: boolean;
  created: string[];
}

export function initializeWorkspace(workspacePath: string): InitResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);

  if (fs.existsSync(path.join(codeforgeRoot, "config.yaml"))) {
    return { alreadyInitialized: true, created: [] };
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

  return { alreadyInitialized: false, created };
}
