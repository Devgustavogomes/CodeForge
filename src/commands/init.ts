import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";

const CODEFORGE_DIR = ".codeforge";

const SUBDIRECTORIES = ["specs", "plans", "tasks", "executions", "rules"];

const DEFAULT_CONFIG = `# CodeForge Configuration
version: "1.0"
`;

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeForge in the current project")
    .action(() => {
      const workspacePath = process.cwd();
      const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);

      if (fs.existsSync(path.join(codeforgeRoot, "config.yaml"))) {
        console.log("\nCodeForge is already initialized in this project.\n");
        process.exit(0);
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

      console.log("\n✓ CodeForge initialized successfully.\n");
      console.log("Created:");
      for (const item of created) {
        console.log(`  ${item}`);
      }
      console.log();
    });
}
