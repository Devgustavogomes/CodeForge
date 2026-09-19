import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { DocsScreen, DocItemInfo } from '../../../../../src/cli/tui/components/docs/DocsScreen.js';
import { translate } from '../../../../../src/cli/ui/i18n.js';
import {
  createInitializedContainer,
  createMockContainer,
  renderWithProviders,
  flushAsync,
} from '../../helpers/renderWithProviders.js';

const manifestEntry = (name: string) => ({
  path: `.codeforge/docs/${name}.md`,
  intents: [],
  scope: [],
  createdAt: '2026-09-06T10:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
});

function createContainerWithDocs(names: string[]) {
  const container = createInitializedContainer();
  container.docsManifestRepository.save({
    version: '1.0',
    documents: Object.fromEntries(
      names.map((name) => [name, manifestEntry(name)]),
    ),
  });
  for (const name of names) {
    container.gw.writeFile(`.codeforge/docs/${name}.md`, `# ${name}`);
  }
  return container;
}

describe('DocsScreen component', () => {
  const mockDocs: DocItemInfo[] = [
    {
      name: 'architecture',
      path: '.codeforge/docs/architecture.md',
      intents: ['.codeforge/intents/tui.md'],
      scope: ['src/cli/tui/**'],
      createdAt: '2026-09-06T10:00:00.000Z',
      updatedAt: '2026-09-06T12:00:00.000Z',
      existsOnDisk: true,
      inManifest: true,
    },
    {
      name: 'api-reference',
      path: '.codeforge/docs/api-reference.md',
      intents: [],
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

    // Fill name and intent
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

  it('opens a localized delete confirmation for the selected document without deleting immediately', async () => {
    const execute = vi.fn().mockReturnValue({
      kind: 'deleted',
      docName: 'architecture',
    });
    const container = createMockContainer({
      deleteDocUseCase: { execute } as any,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        initialDocs={mockDocs}
        isInteractive={true}
        language="en"
      />,
      { container },
    );

    stdin.write('d');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).toContain(translate('tui_docs_delete_title', 'en'));
    expect(output).toContain(
      translate('tui_docs_delete_detail', 'en', { doc: 'architecture' }),
    );
    expect(output).toContain(translate('tui_docs_delete_warning', 'en'));
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['n', 'n'],
    ['Escape', '\u001B'],
  ])('cancels document deletion with %s', async (_label, input) => {
    const execute = vi.fn();
    const container = createMockContainer({
      deleteDocUseCase: { execute } as any,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        initialDocs={mockDocs}
        isInteractive={true}
        language="en"
      />,
      { container },
    );

    stdin.write('d');
    await flushAsync();
    stdin.write(input);
    await flushAsync(input === '\u001B' ? 100 : 5);

    expect(execute).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain(translate('tui_docs_delete_title', 'en'));
    expect(lastFrame() ?? '').toContain('Docs (2)');
  });

  it.each([
    ['y', 'y'],
    ['Enter', '\r'],
  ])('confirms deletion exactly once with %s and refreshes from the manifest', async (_label, input) => {
    const container = createContainerWithDocs(['architecture', 'guide']);
    const execute = vi.spyOn(container.deleteDocUseCase, 'execute');
    const onNotification = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        isInteractive={true}
        language="en"
        onNotification={onNotification}
      />,
      { container },
    );
    await flushAsync();

    stdin.write('d');
    await flushAsync();
    stdin.write(input);
    await flushAsync();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('architecture');
    expect(lastFrame() ?? '').toContain('Docs (1)');
    expect(lastFrame() ?? '').not.toContain('architecture.md');
    expect(lastFrame() ?? '').toContain('guide.md');
    expect(container.docsManifestRepository.load().documents).not.toHaveProperty('architecture');
    const successMessage = translate('tui_docs_delete_success', 'en', {
      doc: 'architecture',
    });
    expect(lastFrame() ?? '').toContain(successMessage);
    expect(onNotification).toHaveBeenCalledWith(successMessage, 'success');
  });

  it('clamps selection after deleting the last selected document', async () => {
    const container = createContainerWithDocs(['alpha', 'bravo', 'charlie']);
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen container={container} isInteractive={true} language="en" />,
      { container },
    );
    await flushAsync();

    stdin.write('j');
    await flushAsync();
    stdin.write('j');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Document Details: charlie.md');

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).toContain('Docs (2)');
    expect(output).toContain('Document Details: bravo.md');
    expect(output).not.toContain('charlie.md');
  });

  it.each([
    [
      'not-initialized',
      { kind: 'not-initialized' },
      translate('tui_delete_not_initialized', 'en'),
    ],
    [
      'doc-not-found',
      { kind: 'doc-not-found' },
      translate('tui_docs_delete_not_found', 'en', { doc: 'architecture' }),
    ],
  ])('preserves the visible list for the %s deletion result', async (_kind, result, expectedMessage) => {
    const execute = vi.fn().mockReturnValue(result);
    const onNotification = vi.fn();
    const container = createMockContainer({
      deleteDocUseCase: { execute } as any,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        initialDocs={mockDocs}
        isInteractive={true}
        language="en"
        onNotification={onNotification}
      />,
      { container },
    );

    stdin.write('d');
    await flushAsync();
    stdin.write('y');
    await flushAsync();

    const output = lastFrame() ?? '';
    expect(output).toContain('Docs (2)');
    expect(output).toContain('architecture.md');
    expect(output).toContain('api-reference.md');
    expect(output).toContain(expectedMessage);
    expect(onNotification).toHaveBeenCalledWith(expectedMessage, 'error');
  });

  it('preserves the visible list and reports thrown deletion errors', async () => {
    const execute = vi.fn(() => {
      throw new Error('permission denied');
    });
    const onNotification = vi.fn();
    const container = createMockContainer({
      deleteDocUseCase: { execute } as any,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        initialDocs={mockDocs}
        isInteractive={true}
        language="en"
        onNotification={onNotification}
      />,
      { container },
    );

    stdin.write('d');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    const expectedMessage = translate('tui_docs_delete_error', 'en', {
      doc: 'architecture',
      error: 'permission denied',
    });
    const output = lastFrame() ?? '';
    expect(output).toContain('Docs (2)');
    expect(output).toContain(expectedMessage);
    expect(onNotification).toHaveBeenCalledWith(expectedMessage, 'error');
  });

  it('ignores the delete hotkey when the document list is empty', async () => {
    const execute = vi.fn();
    const container = createMockContainer({
      deleteDocUseCase: { execute } as any,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        initialDocs={[]}
        isInteractive={true}
        language="en"
      />,
      { container },
    );

    stdin.write('d');
    await flushAsync();

    expect(lastFrame() ?? '').toContain('No documentation files found in');
    expect(lastFrame() ?? '').toContain('.codeforge/docs/');
    expect(lastFrame() ?? '').not.toContain(translate('tui_docs_delete_title', 'en'));
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not leak the delete hotkey through create, update, or view modals', async () => {
    const execute = vi.fn();
    const container = createMockContainer({
      deleteDocUseCase: { execute } as any,
    });
    const { lastFrame, stdin } = renderWithProviders(
      <DocsScreen
        container={container}
        initialDocs={mockDocs}
        isInteractive={true}
        language="en"
      />,
      { container },
    );

    stdin.write('c');
    await flushAsync();
    stdin.write('d');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Create Documentation');
    expect(lastFrame() ?? '').not.toContain(translate('tui_docs_delete_title', 'en'));
    expect(execute).not.toHaveBeenCalled();

    stdin.write('\u001B');
    await flushAsync(100);
    stdin.write('u');
    await flushAsync();
    stdin.write('d');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('Update Documentation');
    expect(lastFrame() ?? '').not.toContain(translate('tui_docs_delete_title', 'en'));
    expect(execute).not.toHaveBeenCalled();

    stdin.write('\u001B');
    await flushAsync(100);
    stdin.write('\r');
    await flushAsync();
    stdin.write('d');
    await flushAsync();
    expect(lastFrame() ?? '').toContain('View Documentation: architecture.md');
    expect(lastFrame() ?? '').not.toContain(translate('tui_docs_delete_title', 'en'));
    expect(execute).not.toHaveBeenCalled();
  });
});
