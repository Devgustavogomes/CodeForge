import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { LogStreamView } from '../../../../../src/cli/tui/components/run/LogStreamView.js';

describe('LogStreamView component', () => {
  it('renders waiting message when logs are empty', () => {
    const { lastFrame } = render(
      <LogStreamView taskId="TASK-001" logs={[]} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Logs: TASK-001');
    expect(output).toContain('(0 lines)');
    expect(output).toContain('Waiting for agent output or no logs recorded...');
  });

  it('renders log lines and auto-scroll status indicator', () => {
    const logs = ['[INFO] Starting build...', '[INFO] Compiling TypeScript', '[SUCCESS] Build complete'];
    const { lastFrame } = render(
      <LogStreamView taskId="TASK-002" logs={logs} maxVisibleLines={10} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Logs: TASK-002');
    expect(output).toContain('(3 lines)');
    expect(output).toContain('[Auto-scroll: ON]');
    expect(output).toContain('[INFO] Starting build...');
    expect(output).toContain('[INFO] Compiling TypeScript');
    expect(output).toContain('[SUCCESS] Build complete');
  });

  it('supports scrolling up and pausing auto-scroll via keyboard navigation', async () => {
    const logs = Array.from({ length: 20 }, (_, i) => `Log line ${i + 1}`);
    const { lastFrame, stdin } = render(
      <LogStreamView taskId="TASK-003" logs={logs} maxVisibleLines={5} isFocused={true} />
    );

    // Initial state: auto-scroll is on, showing bottom lines (16 to 20)
    let output = lastFrame() ?? '';
    expect(output).toContain('[Auto-scroll: ON]');
    expect(output).toContain('Log line 20');

    // Scroll up with 'k'
    stdin.write('k');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[PAUSED');

    // Jump to bottom with 'G' to resume
    stdin.write('G');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[Auto-scroll: ON]');
  });
});
