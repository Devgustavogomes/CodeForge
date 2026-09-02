export interface GitGateway {
  hasRepository(): boolean;
  getChangedFiles(): string[];
  getFileDiff(filePath: string): string | null;
}
