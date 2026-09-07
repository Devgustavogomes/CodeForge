import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { TabBar } from '../../../../../src/cli/tui/components/common/TabBar.js';
import { NavigationProvider } from '../../../../../src/cli/tui/context/NavigationContext.js';

describe('TabBar component', () => {
  it('renders all 5 tabs and rounded borders', () => {
    const { lastFrame } = render(<TabBar activeTab="run" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('[1] Specs');
    expect(output).toContain('[2] Tasks');
    expect(output).toContain('[3] Run');
    expect(output).toContain('[4] Docs');
    expect(output).toContain('[5] Config');
    expect(output).toMatch(/[╭─╮│╰╯]/);
  });

  it('renders inside NavigationProvider and reflects activeTab', () => {
    const { lastFrame } = render(
      <NavigationProvider initialTab="tasks">
        <TabBar />
      </NavigationProvider>
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('[1] Specs');
    expect(output).toContain('[2] Tasks');
  });

  it('allows overriding activeTab with prop', () => {
    const { lastFrame } = render(
      <NavigationProvider initialTab="run">
        <TabBar activeTab="config" />
      </NavigationProvider>
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('[5] Config');
  });
});
