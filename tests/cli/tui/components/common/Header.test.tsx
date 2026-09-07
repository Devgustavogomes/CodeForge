import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Header } from '../../../../../src/cli/tui/components/common/Header.js';
import { NavigationProvider } from '../../../../../src/cli/tui/context/NavigationContext.js';

describe('Header component', () => {
  it('renders default title and shortcuts outside NavigationProvider', () => {
    const { lastFrame } = render(<Header />);
    const output = lastFrame() ?? '';

    expect(output).toContain('⚡ CodeForge');
    expect(output).toContain('No active spec');
    // Check rounded borders (╭ ╮ ╯ ╰)
    expect(output).toMatch(/[╭─╮│╰╯]/);
  });

  it('renders activeSpec from NavigationProvider', () => {
    const { lastFrame } = render(
      <NavigationProvider initialActiveSpec="user-auth">
        <Header />
      </NavigationProvider>
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('⚡ CodeForge');
    expect(output).toContain('Spec: user-auth');
  });

  it('renders custom breadcrumb and custom title when provided', () => {
    const { lastFrame } = render(
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
});
