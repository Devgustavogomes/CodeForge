import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { DocsScreen, DocItemInfo } from '../../../../../src/cli/tui/components/docs/DocsScreen.js';
import { DocProgressBanner } from '../../../../../src/cli/tui/components/docs/components/DocProgressBanner.js';
import { renderWithProviders, createMockContainer } from '../../helpers/renderWithProviders.js';
import { AppContainer } from '../../../../../src/infrastructure/container.js';
import { UpdateDocUseCase } from '../../../../../src/application/use-cases/UpdateDocUseCase.js';
import { ListSpecsUseCase } from '../../../../../src/application/use-cases/ListSpecsUseCase.js';

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

  it('opens update modal in Step 1 when "u" is pressed without triggering update or AI calls', async () => {
    const onUpdateDoc = vi.fn().mockResolvedValue(undefined);
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const container = createMockContainer({
      updateDocUseCase: {
        execute: mockExecute,
        getAffectedDocs: vi.fn(),
        getManualDoc: vi.fn(),
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
      />,
      { container }
    );

    // Initial selected doc is 'architecture'. Verify modal is not initially open.
    expect(lastFrame() ?? '').toContain('Docs (2)');
    expect(lastFrame() ?? '').not.toContain('Atualizar Documentação');

    // Press 'u' to open update modal
    stdin.write('u');
    await tick();

    // Modal is open at Step 1, without any AI or update callback triggered
    const output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação');
    expect(output).toContain('1. Atualizar documento selecionado diretamente');
    expect(output).toContain('Documento alvo:');
    expect(output).toContain('architecture.md');
    expect(output).toContain('2. Detectar automaticamente via Git e Escopo do Manifest');
    expect(output).toContain('[↑/↓ ou j/k] Navegar · [Enter] Avançar · [Esc] Cancelar');

    expect(onUpdateDoc).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('does not open update modal when "u" is pressed and doc list is empty', async () => {
    const onUpdateDoc = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={[]}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
      />
    );

    stdin.write('u');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).not.toContain('Atualizar Documentação');
    expect(onUpdateDoc).not.toHaveBeenCalled();
  });

  it('navigates between mode options in Step 1, advances to Step 2A (Direct Mode), cycles reference spec, and confirms update', async () => {
    const onUpdateDoc = vi.fn().mockResolvedValue(undefined);
    const mockListSpecs = vi.fn().mockReturnValue(['tui', 'specs', 'backend']);
    const container = createMockContainer({
      listSpecsUseCase: {
        listNames: mockListSpecs,
        list: vi.fn(),
      } as unknown as ListSpecsUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
      />,
      { container }
    );

    // Press 'u' to open update modal
    stdin.write('u');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação');

    // Navigate to mode 2 (Auto) using 'j'
    stdin.write('j');
    await tick();
    output = lastFrame() ?? '';
    expect(output).toContain('2. Detectar automaticamente');

    // Navigate back to mode 1 (Direct) using 'k'
    stdin.write('k');
    await tick();
    output = lastFrame() ?? '';
    expect(output).toContain('1. Atualizar documento selecionado diretamente');

    // Confirm mode selection with Enter -> advances to Step 2A (Direct Update Step)
    stdin.write('\r');
    await tick();

    output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação — Modo Direto');
    expect(output).toContain('architecture.md');
    expect(output).toContain('Spec de Referência:');
    expect(output).toContain('● tui');
    expect(output).toContain('○ specs');
    expect(output).toContain('○ backend');
    expect(onUpdateDoc).not.toHaveBeenCalled();

    // Cycle spec with Space -> changes selected spec to 'specs'
    stdin.write(' ');
    await tick();

    output = lastFrame() ?? '';
    expect(output).toContain('○ tui');
    expect(output).toContain('● specs');
    expect(output).toContain('○ backend');

    // Press Enter in Step 2A to confirm direct update
    stdin.write('\r');
    await tick();

    expect(onUpdateDoc).toHaveBeenCalledWith('architecture', 'specs');
  });

  it('displays live progress banner with spinner and timer while updating doc, then success banner with elapsed duration', async () => {
    let resolveUpdate: () => void = () => {};
    const updatePromise = new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    });
    const onUpdateDoc = vi.fn().mockImplementation(() => updatePromise);

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        onUpdateDoc={onUpdateDoc}
        isInteractive={true}
      />
    );

    // Press 'u' to open modal
    stdin.write('u');
    await tick();

    // Advance to Step 2A and confirm
    stdin.write('\r');
    await tick();
    stdin.write('\r');
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

  it('selects Auto Mode in Step 1, displays affected docs list from Git, confirms batch update and shows sequential progress banner', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'affected-docs',
      affectedDocs: [
        {
          docName: 'architecture',
          docPath: '.codeforge/docs/architecture.md',
          specPaths: ['.codeforge/specs/tui.md'],
          matchedFiles: ['src/a.ts', 'src/b.ts'],
        },
        {
          docName: 'api-reference',
          docPath: '.codeforge/docs/api-reference.md',
          specPaths: [],
          matchedFiles: ['src/c.ts'],
        },
      ],
    });

    const container = createMockContainer({
      listSpecsUseCase: { listNames: () => ['tui'] } as unknown as ListSpecsUseCase,
      updateDocUseCase: {
        getAffectedDocs: mockGetAffectedDocs,
        getManualDoc: vi.fn(),
        execute: mockExecute,
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        container={container}
        isInteractive={true}
      />,
      { container }
    );

    // Open update modal with 'u'
    stdin.write('u');
    await tick();

    // Navigate to mode 2 (Auto) using 'j'
    stdin.write('j');
    await tick();

    // Advance to Step 2B with Enter
    stdin.write('\r');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação — Modo Automático');
    expect(output).toContain('Spec de Referência:');
    expect(output).toContain('tui');
    expect(output).toContain('Documentos identificados com alterações de escopo:');
    expect(output).toContain('● [ Atualizar todos os 2 afetados ]');
    expect(output).toContain('architecture');
    expect(output).toContain('(2 arquivos alterados)');
    expect(output).toContain('api-reference');
    expect(output).toContain('(1 arquivo alterado)');
    expect(mockExecute).not.toHaveBeenCalled();

    // Confirm batch update with Enter
    stdin.write('\r');
    await tick(50);

    // Modal closes and updates executed sequentially
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      'tui',
      expect.objectContaining({ docName: 'architecture' }),
      false
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'tui',
      expect.objectContaining({ docName: 'api-reference' }),
      false
    );

    output = lastFrame() ?? '';
    expect(output).toContain('✓ 2 documentações atualizadas com sucesso em');
  });

  it('navigates to an individual affected doc in Auto Mode and confirms single update', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'affected-docs',
      affectedDocs: [
        {
          docName: 'architecture',
          docPath: '.codeforge/docs/architecture.md',
          specPaths: ['.codeforge/specs/tui.md'],
          matchedFiles: ['src/a.ts', 'src/b.ts'],
        },
        {
          docName: 'api-reference',
          docPath: '.codeforge/docs/api-reference.md',
          specPaths: [],
          matchedFiles: ['src/c.ts'],
        },
      ],
    });

    const container = createMockContainer({
      listSpecsUseCase: { listNames: () => ['tui'] } as unknown as ListSpecsUseCase,
      updateDocUseCase: {
        getAffectedDocs: mockGetAffectedDocs,
        getManualDoc: vi.fn(),
        execute: mockExecute,
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        container={container}
        isInteractive={true}
      />,
      { container }
    );

    // Open update modal with 'u'
    stdin.write('u');
    await tick();

    // Select Auto Mode with '2'
    stdin.write('2');
    await tick();

    // Advance to Step 2B with Enter
    stdin.write('\r');
    await tick();

    // Navigate down with 'j' to select individual doc 'architecture' instead of 'all'
    stdin.write('j');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('○ [ Atualizar todos os 2 afetados ]');
    expect(output).toContain('● architecture');

    // Confirm individual update with Enter
    stdin.write('\r');
    await tick(50);

    // Only 1 execution for 'architecture'
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      'tui',
      expect.objectContaining({ docName: 'architecture' }),
      false
    );

    output = lastFrame() ?? '';
    expect(output).toContain('✓ Documentação "architecture.md" atualizada com sucesso em');
  });

  it('handles edge case "no-git" in Auto Mode: displays descriptive warning and stays open until Esc', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'no-git',
    });

    const container = createMockContainer({
      listSpecsUseCase: { listNames: () => ['tui'] } as unknown as ListSpecsUseCase,
      updateDocUseCase: {
        getAffectedDocs: mockGetAffectedDocs,
        getManualDoc: vi.fn(),
        execute: mockExecute,
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        container={container}
        isInteractive={true}
      />,
      { container }
    );

    stdin.write('u');
    await tick();

    stdin.write('j');
    await tick();

    stdin.write('\r');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação — Modo Automático');
    expect(output).toContain('⚠ Repositório Git não encontrado (no-git)');
    expect(output).toContain('Esta operação requer um repositório Git inicializado para detectar alterações.');
    expect(output).toContain('[Esc] Voltar');
    expect(output).not.toContain('[Enter] Atualizar');

    // Enter does NOT trigger update or close modal
    stdin.write('\r');
    await tick();
    expect(mockExecute).not.toHaveBeenCalled();
    output = lastFrame() ?? '';
    expect(output).toContain('⚠ Repositório Git não encontrado (no-git)');

    // Esc returns to Step 1
    stdin.write('\u001B');
    await tick();
    output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação');
    expect(output).toContain('1. Atualizar documento selecionado diretamente');

    // Esc again closes modal
    stdin.write('\u001B');
    await tick();
    output = lastFrame() ?? '';
    expect(output).not.toContain('Atualizar Documentação');
    expect(output).toContain('Docs (2)');
  });

  it('handles edge case "no-changed-files" in Auto Mode: displays descriptive warning and stays open until Esc', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'no-changed-files',
    });

    const container = createMockContainer({
      listSpecsUseCase: { listNames: () => ['tui'] } as unknown as ListSpecsUseCase,
      updateDocUseCase: {
        getAffectedDocs: mockGetAffectedDocs,
        getManualDoc: vi.fn(),
        execute: mockExecute,
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        container={container}
        isInteractive={true}
      />,
      { container }
    );

    stdin.write('u');
    await tick();

    stdin.write('j');
    await tick();

    stdin.write('\r');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação — Modo Automático');
    expect(output).toContain('⚠ Ausência de modificações no Git (no-changed-files)');
    expect(output).toContain('Não há arquivos modificados detectados no repositório de trabalho.');
    expect(output).toContain('[Esc] Voltar');
    expect(output).not.toContain('[Enter] Atualizar');

    // Enter does NOT trigger update
    stdin.write('\r');
    await tick();
    expect(mockExecute).not.toHaveBeenCalled();

    // Esc returns to Step 1
    stdin.write('\u001B');
    await tick();
    output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação');
    expect(output).toContain('1. Atualizar documento selecionado diretamente');

    // Esc closes modal
    stdin.write('\u001B');
    await tick();
    output = lastFrame() ?? '';
    expect(output).not.toContain('Atualizar Documentação');
    expect(output).toContain('Docs (2)');
  });

  it('handles edge case "no-affected-docs" in Auto Mode: displays descriptive warning and stays open until Esc', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'no-affected-docs',
    });

    const container = createMockContainer({
      listSpecsUseCase: { listNames: () => ['tui'] } as unknown as ListSpecsUseCase,
      updateDocUseCase: {
        getAffectedDocs: mockGetAffectedDocs,
        getManualDoc: vi.fn(),
        execute: mockExecute,
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        container={container}
        isInteractive={true}
      />,
      { container }
    );

    stdin.write('u');
    await tick();

    stdin.write('j');
    await tick();

    stdin.write('\r');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação — Modo Automático');
    expect(output).toContain('⚠ Ausência de documentos impactados (no-affected-docs)');
    expect(output).toContain('Nenhum documento cadastrado no manifest possui escopo cobrindo os arquivos modificados.');
    expect(output).toContain('[Esc] Voltar');
    expect(output).not.toContain('[Enter] Atualizar');

    // Enter does NOT trigger update
    stdin.write('\r');
    await tick();
    expect(mockExecute).not.toHaveBeenCalled();

    // Esc returns to Step 1
    stdin.write('\u001B');
    await tick();
    output = lastFrame() ?? '';
    expect(output).toContain('Atualizar Documentação');

    // Esc closes modal
    stdin.write('\u001B');
    await tick();
    output = lastFrame() ?? '';
    expect(output).not.toContain('Atualizar Documentação');
    expect(output).toContain('Docs (2)');
  });

  it('navigates back from Step 2A (Direct Mode) to Step 1 with Esc, and closes modal from Step 1 with Esc', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        isInteractive={true}
      />
    );

    // Open modal in Step 1
    stdin.write('u');
    await tick();
    expect(lastFrame() ?? '').toContain('Atualizar Documentação');
    expect(lastFrame() ?? '').toContain('1. Atualizar documento selecionado diretamente');

    // Advance to Step 2A
    stdin.write('\r');
    await tick();
    expect(lastFrame() ?? '').toContain('Atualizar Documentação — Modo Direto');

    // Press Esc in Step 2A -> returns to Step 1
    stdin.write('\u001B');
    await tick();
    expect(lastFrame() ?? '').toContain('Atualizar Documentação');
    expect(lastFrame() ?? '').toContain('1. Atualizar documento selecionado diretamente');
    expect(lastFrame() ?? '').not.toContain('Atualizar Documentação — Modo Direto');

    // Press Esc in Step 1 -> closes modal and restores main Docs screen
    stdin.write('\u001B');
    await tick();
    expect(lastFrame() ?? '').not.toContain('Atualizar Documentação');
    expect(lastFrame() ?? '').toContain('Docs (2)');
    expect(lastFrame() ?? '').toContain('architecture.md');
  });

  it('navigates back from Step 2B (Auto Mode) to Step 1 with Esc, and closes modal from Step 1 with Esc', async () => {
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'affected-docs',
      affectedDocs: [
        {
          docName: 'architecture',
          docPath: '.codeforge/docs/architecture.md',
          specPaths: [],
          matchedFiles: ['src/a.ts'],
        },
      ],
    });
    const container = createMockContainer({
      listSpecsUseCase: { listNames: () => ['tui'] } as unknown as ListSpecsUseCase,
      updateDocUseCase: {
        getAffectedDocs: mockGetAffectedDocs,
        getManualDoc: vi.fn(),
        execute: vi.fn(),
      } as unknown as UpdateDocUseCase,
    });

    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        initialDocs={mockDocs}
        container={container}
        isInteractive={true}
      />,
      { container }
    );

    // Open modal in Step 1
    stdin.write('u');
    await tick();

    // Select Auto mode
    stdin.write('j');
    await tick();

    // Advance to Step 2B
    stdin.write('\r');
    await tick();
    expect(lastFrame() ?? '').toContain('Atualizar Documentação — Modo Automático');

    // Press Esc in Step 2B -> returns to Step 1
    stdin.write('\u001B');
    await tick();
    expect(lastFrame() ?? '').toContain('Atualizar Documentação');
    expect(lastFrame() ?? '').toContain('1. Atualizar documento selecionado diretamente');

    // Press Esc in Step 1 -> closes modal
    stdin.write('\u001B');
    await tick();
    expect(lastFrame() ?? '').not.toContain('Atualizar Documentação');
    expect(lastFrame() ?? '').toContain('Docs (2)');
  });

  it('navigates documentation items with arrows and j/k, and triggers onViewDoc with Enter', async () => {
    const onViewDoc = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
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

    const { lastFrame: lastFrameBatchInfo } = render(
      <DocProgressBanner
        isGenerating={true}
        operation="update"
        docName="architecture.md"
        batchInfo={{ current: 1, total: 3 }}
        startTime={Date.now() - 2000}
      />
    );
    expect(lastFrameBatchInfo() ?? '').toContain('Atualizando Documentação: [1/3] architecture.md');
    expect(lastFrameBatchInfo() ?? '').toContain('⏱ Decorrido:');

    const { lastFrame: lastFrameBatchFeedback } = render(
      <DocProgressBanner
        isGenerating={false}
        feedback={{
          type: 'success',
          message: '✓ 3 documentações atualizadas com sucesso em 00m 12s!',
        }}
      />
    );
    expect(lastFrameBatchFeedback() ?? '').toContain('✓ 3 documentações atualizadas com sucesso em 00m 12s!');

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
