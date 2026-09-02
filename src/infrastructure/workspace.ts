import fs from "node:fs";
import path from "node:path";

export interface WorkspaceGateway {
  readFile(relativePath: string): string;
  writeFile(relativePath: string, content: string): void;
  deleteFile(relativePath: string): void;
  deleteDir(relativePath: string): void;
  exists(relativePath: string): boolean;
  listDir(relativePath: string): string[];
  mkdir(relativePath: string): void;
}

export class NodeWorkspaceGateway implements WorkspaceGateway {
  constructor(private readonly workspacePath: string) {}

  readFile(relativePath: string): string {
    return fs.readFileSync(path.join(this.workspacePath, relativePath), "utf-8");
  }

  writeFile(relativePath: string, content: string): void {
    fs.writeFileSync(path.join(this.workspacePath, relativePath), content, "utf-8");
  }

  deleteFile(relativePath: string): void {
    const fullPath = path.join(this.workspacePath, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  deleteDir(relativePath: string): void {
    const fullPath = path.join(this.workspacePath, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  exists(relativePath: string): boolean {
    return fs.existsSync(path.join(this.workspacePath, relativePath));
  }

  listDir(relativePath: string): string[] {
    return fs.readdirSync(path.join(this.workspacePath, relativePath));
  }

  mkdir(relativePath: string): void {
    fs.mkdirSync(path.join(this.workspacePath, relativePath), { recursive: true });
  }
}
