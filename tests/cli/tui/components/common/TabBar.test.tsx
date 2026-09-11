import React from 'react';
import { describe, it, expect } from 'vitest';
import { TabBar } from '../../../../../src/cli/tui/components/common/TabBar.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('TabBar component', () => {
  it('renders all 5 tabs', () => {
    const { lastFrame } = renderWithProviders(<TabBar activeTab="run" />);
    const output = lastFrame() ?? '';

    expect(output).toContain('[1] Run');
    expect(output).toContain('[2] Specs');
    expect(output).toContain('[3] Tasks');
    expect(output).toContain('[4] Docs');
    expect(output).toContain('[5] Config');
  });

  it('renders inside NavigationProvider and reflects activeTab', () => {
    const { lastFrame } = renderWithProviders(<TabBar />, {
      initialTab: 'tasks',
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('[1] Run');
    expect(output).toContain('[2] Specs');
    expect(output).toContain('[3] Tasks');
  });

  it('allows overriding activeTab with prop', () => {
    const { lastFrame } = renderWithProviders(<TabBar activeTab="config" />, {
      initialTab: 'run',
    });
    const output = lastFrame() ?? '';

    expect(output).toContain('[5] Config');
  });
});
