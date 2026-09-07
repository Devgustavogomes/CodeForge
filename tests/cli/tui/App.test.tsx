import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../../../src/cli/tui/App.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Root TUI App component', () => {
  it('renders root App with Header, TabBar, StatusBar, and default Run screen', () => {
    const { lastFrame } = render(<App initialTab="run" />);
    const output = lastFrame() ?? '';

    // Header brand
    expect(output).toContain('CodeForge');
    // TabBar elements
    expect(output).toContain('[1] Run');
    expect(output).toContain('[2] Specs');
    expect(output).toContain('[3] Tasks');
    expect(output).toContain('[4] Docs');
    expect(output).toContain('[5] Config');
    // StatusBar shortcuts
    expect(output).toContain('Navigate');
  });

  it('renders custom initialTab directly', () => {
    const { lastFrame } = render(<App initialTab="config" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('CodeForge Configuration Editor');
    expect(output).toContain('Language (i18n)');
  });

  it('switches tabs when numeric keys 1-5 are pressed', async () => {
    const { lastFrame, stdin } = render(<App initialTab="run" />);

    // Press '2' -> Specs screen
    stdin.write('2');
    await tick(80);
    expect(lastFrame()).toContain('Specifications');

    // Press '3' -> Tasks screen
    stdin.write('3');
    await tick(80);
    expect(lastFrame()).toContain('Tasks');

    // Press '4' -> Docs screen
    stdin.write('4');
    await tick(80);
    expect(lastFrame()).toContain('Docs');

    // Press '5' -> Config screen
    stdin.write('5');
    await tick(80);
    expect(lastFrame()).toContain('CodeForge Configuration Editor');

    // Press '1' -> Back to Run screen
    stdin.write('1');
    await tick(80);
    expect(lastFrame()).toContain('[1] Run');
  });

  it('does not open CommandPalette on ":" or Ctrl+K', async () => {
    const { lastFrame, stdin } = render(<App initialTab="run" />);

    // Press ':'
    stdin.write(':');
    await tick(80);
    expect(lastFrame()).not.toContain('Command Palette');

    // Press Ctrl+K (\x0B)
    stdin.write('\x0B');
    await tick(80);
    expect(lastFrame()).not.toContain('Command Palette');
  });

  it('exits cleanly on "q" invoking onExit callback', async () => {
    const onExit = vi.fn();
    const { stdin } = render(<App initialTab="run" onExit={onExit} />);

    stdin.write('q');
    await tick(80);

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('manages alternate screen buffer switching and restoration', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // Simulate TTY
    const originalIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      const { unmount } = render(<App enableAlternateScreen={true} />);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[?1049h'));

      unmount();
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[?1049l'));
    } finally {
      process.stdout.isTTY = originalIsTTY;
      writeSpy.mockRestore();
    }
  });

  it('renders Specs screen with Header intact and within 24-row budget', () => {
    const { lastFrame, unmount } = render(<App initialTab="specs" />);
    const output = lastFrame() ?? '';

    // Verify Header is rendered and intact
    expect(output).toContain('CodeForge');
    expect(output).toContain('No active spec');
    // Verify TabBar is rendered
    expect(output).toContain('[2] Specs');
    // Verify SpecsScreen content is rendered
    expect(output).toContain('Specifications');

    // Verify lines do not exceed standard 24 rows
    const lines = output.split('\n');
    expect(lines.length).toBeLessThanOrEqual(24);

    unmount();
  });

  it('preserves Header across all 5 tabs without height overflow', () => {
    const tabs = ['specs', 'tasks', 'run', 'docs', 'config'] as const;
    for (const tab of tabs) {
      const { lastFrame, unmount } = render(<App initialTab={tab} />);
      const output = lastFrame() ?? '';

      expect(output).toContain('CodeForge');
      const lines = output.split('\n');
      expect(lines.length).toBeLessThanOrEqual(24);

      unmount();
    }
  });

  it('provides container to the tree via ContainerProvider', () => {
    const { lastFrame, unmount } = render(<App initialTab="specs" initialSpec="alpha-spec" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('alpha-spec');
    unmount();
  });
});

