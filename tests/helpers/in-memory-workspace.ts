import { WorkspaceGateway } from "../../src/infrastructure/workspace.js";

export class InMemoryWorkspaceGateway implements WorkspaceGateway {
  public files = new Map<string, string>();
  public directories = new Set<string>();

  constructor(initialFiles?: Record<string, string>) {
    if (initialFiles) {
      for (const [filePath, content] of Object.entries(initialFiles)) {
        this.writeFile(filePath, content);
      }
    }
  }

  private normalize(p: string): string {
    if (!p) return "";
    let normalized = p.replace(/\\/g, "/");
    normalized = normalized.replace(/^\.\//, "");
    normalized = normalized.replace(/\/+/g, "/");
    normalized = normalized.replace(/\/+$/, "");
    if (normalized === ".") return "";
    return normalized;
  }

  readFile(relativePath: string): string {
    const p = this.normalize(relativePath);
    if (!this.files.has(p)) {
      throw new Error(`ENOENT: no such file or directory, open '${relativePath}'`);
    }
    return this.files.get(p)!;
  }

  writeFile(relativePath: string, content: string): void {
    const p = this.normalize(relativePath);
    this.files.set(p, content);

    const lastSlash = p.lastIndexOf("/");
    if (lastSlash !== -1) {
      this.mkdir(p.substring(0, lastSlash));
    }
  }

  exists(relativePath: string): boolean {
    const p = this.normalize(relativePath);
    if (p === "" || p === ".") return true;
    if (this.files.has(p) || this.directories.has(p)) return true;

    const prefix = p + "/";
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) return true;
    }
    for (const dir of this.directories) {
      if (dir.startsWith(prefix)) return true;
    }
    return false;
  }

  listDir(relativePath: string): string[] {
    const p = this.normalize(relativePath);
    const prefix = p === "" ? "" : p + "/";
    const children = new Set<string>();

    const checkPaths = (paths: Iterable<string>) => {
      for (const item of paths) {
        if (prefix === "" || item.startsWith(prefix)) {
          const rest = prefix === "" ? item : item.slice(prefix.length);
          if (rest) {
            children.add(rest.split("/")[0]);
          }
        }
      }
    };

    checkPaths(this.files.keys());
    checkPaths(this.directories.values());

    return Array.from(children);
  }

  mkdir(relativePath: string): void {
    const p = this.normalize(relativePath);
    if (!p) return;
    const parts = p.split("/");
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      this.directories.add(current);
    }
  }

  deleteFile(relativePath: string): void {
    const p = this.normalize(relativePath);
    this.files.delete(p);
  }

  deleteDir(relativePath: string): void {
    const p = this.normalize(relativePath);
    const prefix = p === "" ? "" : p + "/";
    for (const key of Array.from(this.files.keys())) {
      if (key === p || key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
    for (const dir of Array.from(this.directories)) {
      if (dir === p || dir.startsWith(prefix)) {
        this.directories.delete(dir);
      }
    }
  }
}
