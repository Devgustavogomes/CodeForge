import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { render, type Instance, type RenderOptions } from 'ink';
import { runInteractiveMenu } from '../../src/cli/interactive.js';
import { createAppContainer } from '../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../helpers/in-memory-workspace.js';
import { InMemoryAgentRunner } from '../helpers/in-memory-agent-runner.js';
import { setupInitializedWorkspace } from './tui/helpers/renderWithProviders.js';

vi.mock('ink', async (importOriginal) => {
  const ink = await importOriginal<typeof import('ink')>();
  return { ...ink, render: vi.fn(ink.render) };
});

class TerminalOutput extends Writable {
  isTTY = true;
  chunks: string[] = [];

  constructor(public columns: number, public rows: number) {
    super();
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
    this.chunks.push(chunk.toString());
    callback();
  }
}

class TerminalInput extends PassThrough {
  isTTY = true;
  setRawMode = vi.fn();
  ref() { return this; }
  unref() { return this; }
}

describe('interactive terminal rendering', () => {
  // ink-testing-library uses debug mode, which skips the ANSI redraw path.
  it.each([[200, 60], [100, 24], [80, 24]])(
    'updates logs and navigates without blanking the viewport at %ix%i',
    async (columns, rows) => {
      const ink = await vi.importActual<typeof import('ink')>('ink');
      const stdout = new TerminalOutput(columns, rows);
      const stdin = new TerminalInput();
      const stderr = new PassThrough();
      let instance: Instance | undefined;
      vi.mocked(render).mockImplementation((tree, options) => {
        instance = ink.render(tree, {
          ...options as RenderOptions,
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin: stdin as unknown as NodeJS.ReadStream,
          stderr: stderr as unknown as NodeJS.WriteStream,
          interactive: true,
          patchConsole: false,
        });
        return instance;
      });

      const gw = new InMemoryWorkspaceGateway();
      setupInitializedWorkspace(gw);
      gw.mkdir('.codeforge/intents');
      gw.writeFile('.codeforge/intents/rendering.md', '# Rendering regression');
      gw.mkdir('.codeforge/tasks/rendering');
      gw.writeFile('.codeforge/tasks/rendering/TASK-001.json', JSON.stringify({
        id: 'TASK-001', title: 'Rendering regression', dependencies: [],
        objective: 'Exercise live terminal output', context: '', implementation: '',
        files: [], constraints: [], acceptanceCriteria: [],
      }));

      let finishTask!: () => void;
      const pendingTask = new Promise<void>((resolve) => { finishTask = resolve; });
      let emitLog: ((chunk: string) => void) | undefined;
      const runner = new InMemoryAgentRunner({
        handler: (context) => {
          emitLog = context.onLog;
          return pendingTask;
        },
      });
      const container = createAppContainer(gw, { runnerProvider: () => runner });
      const originalIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = false;
      const menu = runInteractiveMenu({
        container, initialTab: 'run', initialIntent: 'rendering', autoStart: true,
      });

      try {
        await vi.waitFor(() => expect(emitLog).toBeTypeOf('function'));
        await instance!.waitUntilRenderFlush();
        // Compact mode initially shows tasks; switch to logs before streaming.
        if (columns < 100) {
          stdin.write('\t');
          await vi.waitFor(() => expect(stdout.chunks.join('')).toContain('Logs: TASK-001'));
          await instance!.waitUntilRenderFlush();
        }

        stdout.chunks.length = 0;
        emitLog!('[INFO] live-output-regression\n');
        await vi.waitFor(() => expect(stdout.chunks.join('')).toContain('live-output-regression'));
        await instance!.waitUntilRenderFlush();
        const logUpdate = stdout.chunks.join('');
        expect(logUpdate).not.toContain('\x1b[2K');
        expect(logUpdate).not.toContain('\x1b[2J');
        expect(logUpdate).not.toContain('CodeForge');

        stdout.chunks.length = 0;
        stdin.write('2');
        await vi.waitFor(() => expect(stdout.chunks.join('')).toContain('Intents'));
        await instance!.waitUntilRenderFlush();
        const tabUpdate = stdout.chunks.join('');
        expect(tabUpdate).not.toContain('\x1b[2K');
        expect(tabUpdate).not.toContain('\x1b[2J');

        // Return to the running dashboard and check height-only resize as well.
        stdout.chunks.length = 0;
        stdin.write('1');
        await vi.waitFor(() => expect(stdout.chunks.join('')).toContain('TASK-001'));
        if (columns < 100) {
          stdin.write('\t');
          await vi.waitFor(() => expect(stdout.chunks.join('')).toContain('Logs: TASK-001'));
        }
        await instance!.waitUntilRenderFlush();
        stdout.rows += 10;
        stdout.emit('resize');
        await instance!.waitUntilRenderFlush();
        stdout.chunks.length = 0;
        emitLog!('[INFO] resized-output-regression\n');
        await vi.waitFor(() => expect(stdout.chunks.join('')).toContain('resized-output-regression'));
        await instance!.waitUntilRenderFlush();
        expect(stdout.chunks.join('')).not.toContain('\x1b[2K');
        expect(stdout.chunks.join('')).not.toContain('\x1b[2J');
      } finally {
        finishTask();
        instance?.unmount();
        await menu;
        instance?.cleanup();
        process.stdout.isTTY = originalIsTTY;
        vi.restoreAllMocks();
      }
    },
  );
});
