import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";

export interface WorkspaceGateway {
  executionWorkspace(): WorkspaceGateway;
  readFile(relativePath: string): string;
  writeFile(relativePath: string, content: string): void;
  writeFileAtomic(relativePath: string, content: string): void;
  withFileLock<T>(relativePath: string, action: () => T): T;
  deleteFile(relativePath: string): void;
  deleteDir(relativePath: string): void;
  exists(relativePath: string): boolean;
  listDir(relativePath: string): string[];
  mkdir(relativePath: string): void;
}

export class NodeWorkspaceGateway implements WorkspaceGateway {
  constructor(
    private readonly workspacePath: string,
    private readonly centralWorkspacePath: string = workspacePath,
  ) {}

  executionWorkspace(): WorkspaceGateway {
    return new NodeWorkspaceGateway(this.centralWorkspacePath);
  }

  readFile(relativePath: string): string {
    return fs.readFileSync(path.join(this.workspacePath, relativePath), "utf-8");
  }

  writeFile(relativePath: string, content: string): void {
    fs.writeFileSync(path.join(this.workspacePath, relativePath), content, "utf-8");
  }

  /** The gateway must be rooted at the central checkout, never a task worktree. */
  writeFileAtomic(relativePath: string, content: string): void {
    const destination = path.join(this.workspacePath, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = destination + "." + randomUUID() + ".tmp";
    try {
      const fd = fs.openSync(temporary, "wx");
      try {
        fs.writeFileSync(fd, content, "utf-8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, destination);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  withFileLock<T>(relativePath: string, action: () => T): T {
    const lockPath = path.join(this.workspacePath, relativePath);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    // Exclusive creation serializes independent repository instances and processes.
    // A crash leaves ownership evidence. Never steal a lock on a timeout or PID alone.
    const deadline = Date.now() + 5000;
    let fd: number;
    while (true) {
      try { fd = fs.openSync(lockPath, "wx"); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new Error(`Execution state lock remains occupied; reconcile ownership at ${lockPath}`, { cause: error });
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(),
        token: randomUUID(), startedAt: new Date().toISOString() }));
      fs.fsyncSync(fd);
      return action();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lockPath);
    }
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
