import React from 'react';
import { describe, it, expect } from 'vitest';
import { StatusBar } from '../../../../../src/cli/tui/components/common/StatusBar.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('StatusBar component', () => {
  it('renders default hints for run tab', () => {
    const { lastFrame } = renderWithProviders(<StatusBar activeTab="run" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Retry');
    expect(output).toContain('Complete');
  });

  it('renders default hints from NavigationProvider tab', () => {
    const { lastFrame } = renderWithProviders(<StatusBar />, {
      initialTab: 'specs',
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('Create');
    expect(output).toContain('Pull');
    expect(output).toContain('Plan');
  });

  it('renders custom hints when provided', () => {
    const { lastFrame } = renderWithProviders(
      <StatusBar hints={['Ctrl+C: Cancel', 'Enter: Select']} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Ctrl+C: Cancel');
    expect(output).toContain('Enter: Select');
  });

  it('renders status message when present', () => {
    const { lastFrame } = renderWithProviders(<StatusBar status="All systems operational" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('● All systems operational');
  });

  it('renders error message when present', () => {
    const { lastFrame } = renderWithProviders(<StatusBar error="Task execution failed" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('✗ Task execution failed');
  });

  it('does not display [Ctrl+K] or Ctrl+K in hints across all tabs', () => {
    const tabs = ['run', 'specs', 'tasks', 'docs', 'config'] as const;
    for (const tab of tabs) {
      const { lastFrame } = renderWithProviders(<StatusBar activeTab={tab} />);
      const output = lastFrame() ?? '';
      expect(output).not.toContain('Ctrl+K');
    }
  });
});
