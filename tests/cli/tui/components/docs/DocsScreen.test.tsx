import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { DocsScreen, DocItemInfo } from '../../../../../src/cli/tui/components/docs/DocsScreen.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('DocsScreen component', () => {
  const mockDocs: DocItemInfo[] = [
    {
      name: 'architecture',
      path: '.codeforge/docs/architecture.md',
      specs: ['.codeforge/specs/tui.md'],
      scope: ['src/cli/tui/**'],
      createdAt: '2026-09-06T10:00:00.000Z',
      updatedAt: '2026-09-06T12:00:00.000Z',
      existsOnDisk: true,
      inManifest: true,
    },
    {
      name: 'api-reference',
      path: '.codeforge/docs/api-reference.md',
      specs: [],
      scope: [],
      createdAt: 'N/A',
      updatedAt: 'N/A',
      existsOnDisk: true,
      inManifest: false,
    },
  ];

  it('renders documentation list with tracking status and metadata', () => {
    const { lastFrame } = render(
      <DocsScreen initialDocs={mockDocs} isInteractive={false} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Docs (2)');
    expect(output).toContain('architecture.md');
    expect(output).toContain('[TRACKED]');
    expect(output).toContain('api-reference.md');
    expect(output).toContain('[UNTRACKED]');
    expect(output).toContain('Document Details: architecture.md');
    expect(output).toContain('src/cli/tui/**');
  });

  it('opens create modal with "c" and triggers doc creation callback', async () => {
    const onCreateDoc = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin } = render(
      <DocsScreen
        initialDocs={mockDocs}
        onCreateDoc={onCreateDoc}
        isInteractive={true}
      />
    );

    // Press 'c' to open Create Doc Modal
    stdin.write('c');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Create Documentation');
    expect(output).toContain('1. Document Name (slug):');

    // Type doc name
    stdin.write('database');
    await tick();

    // Tab to next field
    stdin.write('\t');
    await tick();

    // Type spec name
    stdin.write('tui');
    await tick();

    // Submit with Enter
    stdin.write('\r');
    await tick();

    expect(onCreateDoc).toHaveBeenCalledWith('database', 'tui');
  });

  it('triggers update use case callback when "u" is pressed', async () => {
    const onUpdateDoc = vi.fn().mockResolvedValue(undefined);
    const { stdin } = render(
      <DocsScreen
        initialDocs={mockDocs}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
      />
    );

    // Initial selected doc is 'architecture'. Press 'u' to update
    stdin.write('u');
    await tick();

    expect(onUpdateDoc).toHaveBeenCalledWith('architecture', 'tui');
  });
});
