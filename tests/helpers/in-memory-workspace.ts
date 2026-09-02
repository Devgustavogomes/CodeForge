import { WorkspaceGateway } from "../../src/infrastructure/workspace.js";

export class InMemoryWorkspaceGateway implements WorkspaceGateway {
  public files = new Map<string, string>();
  public directories = new Set<string>();

  private normalize(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
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
  }

  exists(relativePath: string): boolean {
    const p = this.normalize(relativePath);
    if (p === '' || p === '.') return true;
    return this.files.has(p) || this.directories.has(p);
  }

  listDir(relativePath: string): string[] {
    const p = this.normalize(relativePath);
    const prefix = p === '' || p === '.' ? '' : p + '/';
    const children = new Set<string>();

    const checkPaths = (paths: IterableIterator<string>) => {
      for (const item of paths) {
        if (prefix === '' || item.startsWith(prefix)) {
          const rest = prefix === '' ? item : item.slice(prefix.length);
          if (rest) {
            children.add(rest.split('/')[0]);
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
    const parts = p.split('/');
    let current = '';
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
    const prefix = p === '' || p === '.' ? '' : p + '/';
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
