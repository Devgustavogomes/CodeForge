import React from 'react';
import { describe, it, expect } from 'vitest';
import { Header } from '../../../../../src/cli/tui/components/common/Header.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('Header component', () => {
  it('renders default title and shortcuts', () => {
    const { lastFrame } = renderWithProviders(<Header />);
    const output = lastFrame() ?? '';

    expect(output).toContain('</> CodeForge');
    expect(output).toContain('No active spec');
  });

  it('renders activeSpec from prop or ExecutionProvider', () => {
    const { lastFrame } = renderWithProviders(
      <Header activeSpec="user-auth" />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('</> CodeForge');
    expect(output).toContain('Spec: user-auth');
  });

  it('renders custom breadcrumb and custom title when provided', () => {
    const { lastFrame } = renderWithProviders(
      <Header
        title="CodeForge Pro"
        breadcrumb="CodeForge > Specs > TASK-002"
        shortcuts="[?] Help"
      />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('CodeForge Pro');
    expect(output).toContain('CodeForge > Specs > TASK-002');
  });

  it('does not display [Ctrl+K] and displays default [q] Quit on wide terminal', () => {
    const originalColumns = process.stdout.columns;
    const originalRows = process.stdout.rows;
    process.stdout.columns = 120;
    process.stdout.rows = 30;

    try {
      const { lastFrame } = renderWithProviders(<Header />);
      const output = lastFrame() ?? '';

      expect(output).not.toContain('Ctrl+K');
      expect(output).toContain('[q] Quit');
    } finally {
      process.stdout.columns = originalColumns;
      process.stdout.rows = originalRows;
    }
  });
});
