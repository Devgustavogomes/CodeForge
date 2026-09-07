import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { DocsScreen, DocItemInfo } from '../../../../../src/cli/tui/components/docs/DocsScreen.js';
import { DocProgressBanner } from '../../../../../src/cli/tui/components/docs/components/DocProgressBanner.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

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
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onCreateDoc={onCreateDoc}
        isInteractive={true}
      />
    );

    // Press 'c' to open Create Doc Modal
    stdin.write('c');
    await tick();

    const output = lastFrame() ?? '';
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

  it('displays live progress banner with spinner and timer while updating doc, then success banner with elapsed duration', async () => {
    let resolveUpdate: () => void = () => {};
    const updatePromise = new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    });
    const onUpdateDoc = vi.fn().mockImplementation(() => updatePromise);

    const { lastFrame, stdin } = render(
      <DocsScreen
        initialDocs={mockDocs}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
      />
    );

    // Press 'u' to trigger update
    stdin.write('u');
    await tick();

    // Check that active progress banner is rendered with title, spinner and timer prefix
    let output = lastFrame() ?? '';
    expect(output).toContain('Atualizando Documentação: [architecture.md]');
    expect(output).toContain('Gerando conteúdo técnico via use-case...');
    expect(output).toContain('⏱ Decorrido:');

    // Complete the update
    resolveUpdate();
    await tick(50);

    // Check that success banner is displayed with duration
    output = lastFrame() ?? '';
    expect(output).toContain('✓ Documentação "architecture.md" atualizada com sucesso em');
  });

  it('displays active progress banner during creation and success banner after completion', async () => {
    let resolveCreate: () => void = () => {};
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    const onCreateDoc = vi.fn().mockImplementation(() => createPromise);

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onCreateDoc={onCreateDoc}
        isInteractive={true}
      />
    );

    stdin.write('c');
    await tick();

    // Enter name
    stdin.write('deployment');
    await tick();

    // Tab to spec
    stdin.write('\t');
    await tick();

    stdin.write('tui');
    await tick();

    // Submit
    stdin.write('\r');
    await tick();

    // Modal closed and creation is in progress
    let output = lastFrame() ?? '';
    expect(output).toContain('Criando Documentação: [deployment]');
    expect(output).toContain('Gerando conteúdo técnico via use-case...');
    expect(output).toContain('⏱ Decorrido:');

    resolveCreate();
    await tick(50);

    output = lastFrame() ?? '';
    expect(output).toContain('✓ Documentação "deployment" criada com sucesso em');
  });

  it('navigates documentation items with arrows and j/k, and triggers onViewDoc with Enter', async () => {
    const onViewDoc = vi.fn();
    const { lastFrame, stdin } = render(
      <DocsScreen
        initialDocs={mockDocs}
        onViewDoc={onViewDoc}
        isInteractive={true}
      />
    );

    // Initial selected doc is index 0: architecture
    expect(lastFrame() ?? '').toContain('Document Details: architecture.md');

    // Press 'j' to navigate down
    stdin.write('j');
    await tick();
    expect(lastFrame() ?? '').toContain('Document Details: api-reference.md');

    // Press Enter to view doc
    stdin.write('\r');
    await tick();
    expect(onViewDoc).toHaveBeenCalledWith(expect.objectContaining({ name: 'api-reference' }));

    // Press 'k' to navigate up
    stdin.write('k');
    await tick();
    expect(lastFrame() ?? '').toContain('Document Details: architecture.md');
  });

  it('closes create modal when Esc is pressed', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        isInteractive={true}
      />
    );

    stdin.write('c');
    await tick();
    expect(lastFrame() ?? '').toContain('Create Documentation');

    stdin.write('\u001B'); // Esc
    await tick();
    expect(lastFrame() ?? '').not.toContain('Create Documentation');
    expect(lastFrame() ?? '').toContain('Docs (2)');
  });

  it('renders DocProgressBanner correctly in isolation for active and feedback states', () => {
    const { lastFrame: lastFrameActive } = render(
      <DocProgressBanner
        isGenerating={true}
        operation="update"
        docName="security.md"
        startTime={Date.now() - 5000}
      />
    );
    expect(lastFrameActive() ?? '').toContain('Atualizando Documentação: [security.md]');
    expect(lastFrameActive() ?? '').toContain('Gerando conteúdo técnico via use-case...');
    expect(lastFrameActive() ?? '').toContain('⏱ Decorrido:');

    const { lastFrame: lastFrameSuccess } = render(
      <DocProgressBanner
        isGenerating={false}
        feedback={{
          type: 'success',
          message: '✓ Documentação "security.md" atualizada com sucesso em 00m 05s!',
        }}
      />
    );
    expect(lastFrameSuccess() ?? '').toContain('✓ Documentação "security.md" atualizada com sucesso em 00m 05s!');

    const { lastFrame: lastFrameError } = render(
      <DocProgressBanner
        isGenerating={false}
        feedback={{
          type: 'error',
          message: 'Falha ao atualizar documentação: Network error',
        }}
      />
    );
    expect(lastFrameError() ?? '').toContain('Falha ao atualizar documentação: Network error');

    const { lastFrame: lastFrameIdle } = render(
      <DocProgressBanner isGenerating={false} />
    );
    expect(lastFrameIdle() ?? '').toBe('');
  });

  it('renders DocsScreen seamlessly with renderWithProviders', () => {
    const { lastFrame } = renderWithProviders(
      <DocsScreen initialDocs={mockDocs} isInteractive={false} />
    );
    expect(lastFrame() ?? '').toContain('Docs (2)');
    expect(lastFrame() ?? '').toContain('architecture.md');
  });
});
