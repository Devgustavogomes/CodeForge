import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ViewDocModal } from '../../../../../src/cli/tui/components/docs/ViewDocModal.js';
import { DocItemInfo } from '../../../../../src/cli/tui/components/docs/DocsScreen.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';

describe('ViewDocModal component', () => {
  const mockDoc: DocItemInfo = {
    name: 'architecture',
    path: '.codeforge/docs/architecture.md',
    intents: ['.codeforge/intents/tui.md'],
    scope: ['src/cli/tui/**'],
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T12:00:00.000Z',
    existsOnDisk: true,
    inManifest: true,
  };

  const sampleContent = Array.from({ length: 40 }, (_, i) => `# Section ${i + 1}\nContent line ${i + 1}`).join('\n');

  it('scrolls down and up using j/k keyboard shortcuts', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <ViewDocModal
        doc={mockDoc}
        content={sampleContent}
        isOpen={true}
        onClose={onClose}
        language="en"
        maxVisibleLines={5}
      />
    );

    expect(lastFrame() ?? '').toContain('# Section 1');

    // Scroll down with 'j'
    stdin.write('j');
    await flushAsync();
    stdin.write('j');
    await flushAsync();

    let output = lastFrame() ?? '';
    expect(output).toContain('3-7 /');

    // Jump to bottom with 'G'
    stdin.write('G');
    await flushAsync();

    output = lastFrame() ?? '';
    expect(output).toContain('[BOTTOM]');

    // Jump to top with 'g'
    stdin.write('g');
    await flushAsync();

    output = lastFrame() ?? '';
    expect(output).toContain('[TOP]');
  });

  it('closes modal on Esc or q', async () => {
    const onClose = vi.fn();
    const { stdin } = renderWithProviders(
      <ViewDocModal
        doc={mockDoc}
        content={sampleContent}
        isOpen={true}
        onClose={onClose}
        language="pt"
      />
    );

    stdin.write('q');
    await flushAsync();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
