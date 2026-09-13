import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { DocsScreen, DocItemInfo } from '../../../../../src/cli/tui/components/docs/DocsScreen.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';

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

  it('opens create modal with "c" and triggers onCreateDoc on submit', async () => {
    const onCreateDoc = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onCreateDoc={onCreateDoc}
        isInteractive={true}
        language="en"
      />
    );

    // Open create modal
    stdin.write('c');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Create Documentation');
    expect(lastFrame() ?? '').toContain('1. Document Name (slug):');

    // Fill name and spec
    stdin.write('database');
    await flushAsync();
    stdin.write('\t');
    await flushAsync();
    stdin.write('tui');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(onCreateDoc).toHaveBeenCalledWith('database', 'tui');
  });

  it('opens update modal with "u" in Step 1 and permits direct manual submission', async () => {
    const onUpdateDoc = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
        language="pt"
      />
    );

    // Initial selected doc is 'architecture'
    stdin.write('u');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação');
    expect(output).toContain('1. Atualizar documento selecionado diretamente');
    expect(output).toContain('architecture.md');
    expect(onUpdateDoc).not.toHaveBeenCalled();

    // Advance to Step 2A (Direct Mode)
    stdin.write('\r');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('Atualizar Documentação — Modo Direto');

    // Confirm direct update
    stdin.write('\r');
    await flushAsync();

    expect(onUpdateDoc).toHaveBeenCalledWith('architecture', 'tui');
  });

  it('opens expanded markdown doc viewer modal when pressing Enter and closes on Esc', async () => {
    const onViewDoc = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        isInteractive={true}
        language="pt"
        onViewDoc={onViewDoc}
      />
    );

    // Press Enter to view architecture.md
    stdin.write('\r');
    await flushAsync();

    let output = lastFrame() ?? '';
    expect(output).toContain('Visualizar Documentação: architecture.md');
    expect(output).toContain('.codeforge/docs/architecture.md');
    expect(onViewDoc).toHaveBeenCalledWith(mockDocs[0]);

    // Press q to exit view modal
    stdin.write('q');
    await flushAsync();

    output = lastFrame() ?? '';
    expect(output).not.toContain('Visualizar Documentação: architecture.md');
    expect(output).toContain('Docs (2)');
  });
});
