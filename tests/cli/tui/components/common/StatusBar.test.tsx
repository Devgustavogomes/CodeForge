import React from 'react';
import { describe, it, expect } from 'vitest';
import { StatusBar } from '../../../../../src/cli/tui/components/common/StatusBar.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('StatusBar component', () => {
  it('exibe as legendas padrão corretas para a aba specs', () => {
    const { lastFrame } = renderWithProviders(<StatusBar activeTab="specs" />, {
      initialTab: 'specs',
    });
    const output = lastFrame() ?? '';

    expect(output).toContain(
      '↑/↓: Navigate  │  Enter: Run  │  t: Tasks  │  g: Plan  │  p: Pull  │  c: Create  │  v: Validate'
    );
  });
});
