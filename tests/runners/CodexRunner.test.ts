import { describe, expect, it, vi } from 'vitest';
import { CodexRunner } from '../../src/runners/CodexRunner.js';
import type { ProcessExecutor } from '../../src/infrastructure/process/ProcessExecutor.js';

describe('CodexRunner', () => {
  it('runs the executable without a shell and captures review output', async () => {
    const spawn = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
    const executor = { spawn, exec: vi.fn() } as unknown as ProcessExecutor;
    const onLog = vi.fn();

    await new CodexRunner(executor).execute({
      promptFilePath: 'review.md', intentName: 'example', model: 'gpt-5.6-terra',
      silent: true, quietTerminal: true, onLog,
    });

    expect(spawn).toHaveBeenCalledWith('codex', [
      '--ask-for-approval', 'never', 'exec', '--sandbox', 'workspace-write',
      '--model', 'gpt-5.6-terra', '-',
    ], expect.objectContaining({
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      pipePromptFile: 'review.md',
      onStdout: onLog,
      onStderr: onLog,
    }));
  });
});
