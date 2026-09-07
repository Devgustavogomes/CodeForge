import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../../../../src/cli/tui/components/common/StatusBar.js';
import { NavigationProvider } from '../../../../../src/cli/tui/context/NavigationContext.js';

describe('StatusBar component', () => {
  it('renders default hints for run tab and rounded borders', () => {
    const { lastFrame } = render(<StatusBar activeTab="run" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Retry');
    expect(output).toContain('Complete');
    expect(output).toMatch(/[╭─╮│╰╯]/);
  });

  it('renders default hints from NavigationProvider tab', () => {
    const { lastFrame } = render(
      <NavigationProvider initialTab="specs">
        <StatusBar />
      </NavigationProvider>
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Create');
    expect(output).toContain('Pull');
    expect(output).toContain('Plan');
  });

  it('renders custom hints when provided', () => {
    const { lastFrame } = render(
      <StatusBar hints={['Ctrl+C: Cancel', 'Enter: Select']} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Ctrl+C: Cancel');
    expect(output).toContain('Enter: Select');
  });

  it('renders status message when present', () => {
    const { lastFrame } = render(<StatusBar status="All systems operational" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('● All systems operational');
  });

  it('renders error message when present', () => {
    const { lastFrame } = render(<StatusBar error="Task execution failed" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('✗ Task execution failed');
  });
});
