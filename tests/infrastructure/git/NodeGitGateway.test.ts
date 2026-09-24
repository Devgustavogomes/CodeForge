import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { NodeGitGateway } from '../../../src/infrastructure/git/NodeGitGateway.js';
import { InMemoryWorkspaceGateway } from '../../helpers/in-memory-workspace.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

describe('NodeGitGateway', () => {
  it('captures Git warnings and passes file paths as arguments', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('src/file with spaces.ts\n' as never)
      .mockReturnValueOnce('diff content\n' as never);
    const git = new NodeGitGateway(new InMemoryWorkspaceGateway());

    expect(git.getChangedFiles()).toEqual(['src/file with spaces.ts']);
    expect(git.getFileDiff('src/file with spaces.ts')).toBe('diff content');
    expect(execFileSync).toHaveBeenNthCalledWith(1, 'git', ['diff', 'HEAD', '--name-only'], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'git', ['diff', 'HEAD', '--', 'src/file with spaces.ts'], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  });
});
