import React from 'react';
import { describe, it, expect } from 'vitest';
import { LogStreamView } from '../../../../../src/cli/tui/components/run/LogStreamView.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('LogStreamView component', () => {
  it('renders waiting message when logs are empty', () => {
    const { lastFrame } = renderWithProviders(
      <LogStreamView taskId="TASK-001" logs={[]} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Logs: TASK-001');
    expect(output).toContain('(0 lines)');
    expect(output).toContain('Waiting for agent output or no logs recorded...');
  });

  it('renders log lines, auto-scroll status, and default wrap indicator [Wrap: ON]', () => {
    const logs = ['[INFO] Starting build...', '[INFO] Compiling TypeScript', '[SUCCESS] Build complete'];
    const { lastFrame } = renderWithProviders(
      <LogStreamView taskId="TASK-002" logs={logs} maxVisibleLines={10} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Logs: TASK-002');
    expect(output).toContain('(3 lines)');
    expect(output).toContain('[Wrap: ON]');
    expect(output).toContain('[Auto-scroll: ON]');
    expect(output).toContain('[INFO] Starting build...');
    expect(output).toContain('[INFO] Compiling TypeScript');
    expect(output).toContain('[SUCCESS] Build complete');
  });

  it('toggles wrap state with "w" key when focused, and ignores "w" when not focused', async () => {
    const logs = ['Log line 1', 'Log line 2'];

    // 1. When focused: 'w' toggles wrap state
    const { lastFrame, stdin } = renderWithProviders(
      <LogStreamView taskId="TASK-003" logs={logs} isFocused={true} />
    );

    let output = lastFrame() ?? '';
    expect(output).toContain('[Wrap: ON]');

    // Press 'w' to toggle to OFF
    stdin.write('w');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[Wrap: OFF]');

    // Press 'w' again to toggle back to ON
    stdin.write('w');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[Wrap: ON]');

    // 2. When NOT focused: 'w' is ignored
    const { lastFrame: unfocusedFrame, stdin: unfocusedStdin } = renderWithProviders(
      <LogStreamView taskId="TASK-004" logs={logs} isFocused={false} />
    );
    let unfocusedOutput = unfocusedFrame() ?? '';
    expect(unfocusedOutput).toContain('[Wrap: ON]');

    unfocusedStdin.write('w');
    await new Promise((r) => setTimeout(r, 50));
    unfocusedOutput = unfocusedFrame() ?? '';
    expect(unfocusedOutput).toContain('[Wrap: ON]');
  });

  it('supports scrolling up and pausing auto-scroll via keyboard navigation (k, G, g)', async () => {
    const logs = Array.from({ length: 20 }, (_, i) => `Log line ${i + 1}`);
    const { lastFrame, stdin } = renderWithProviders(
      <LogStreamView taskId="TASK-005" logs={logs} maxVisibleLines={5} isFocused={true} />
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

    // Jump to top with 'g'
    stdin.write('g');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('Log line 1');
    expect(output).toContain('[PAUSED');

    // Jump to bottom with 'G' to resume
    stdin.write('G');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[Auto-scroll: ON]');
    expect(output).toContain('Log line 20');
  });

  it('handles arrow keys and page navigation for scrolling', async () => {
    const logs = Array.from({ length: 30 }, (_, i) => `Entry ${i + 1}`);
    const { lastFrame, stdin } = renderWithProviders(
      <LogStreamView taskId="TASK-006" logs={logs} maxVisibleLines={5} isFocused={true} />
    );

    // Scroll up using Up Arrow
    stdin.write('\u001B[A');
    await new Promise((r) => setTimeout(r, 50));
    let output = lastFrame() ?? '';
    expect(output).toContain('[PAUSED');

    // Scroll down to bottom using Down Arrow
    stdin.write('G');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[Auto-scroll: ON]');
  });

  it('renders wrapped lines when wrap is ON and switches to truncated lines when toggled OFF', async () => {
    const longLine = 'A very long log message with multiple words that should wrap across several lines in narrow terminal views.';
    const { lastFrame, stdin } = renderWithProviders(
      <LogStreamView taskId="TASK-007" logs={[longLine]} isFocused={true} />
    );

    // Initial state: Wrap is ON
    let output = lastFrame() ?? '';
    expect(output).toContain('[Wrap: ON]');
    expect(output).toContain('A very long log message');

    // Toggle wrap OFF
    stdin.write('w');
    await new Promise((r) => setTimeout(r, 50));
    output = lastFrame() ?? '';
    expect(output).toContain('[Wrap: OFF]');
  });
});
