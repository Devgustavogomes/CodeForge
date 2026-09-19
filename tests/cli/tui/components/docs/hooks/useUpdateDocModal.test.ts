import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useUpdateDocModal,
  UseUpdateDocModalOptions,
  UseUpdateDocModalReturn,
} from '../../../../../../src/cli/tui/components/docs/hooks/useUpdateDocModal.js';
import { AppContainer } from '../../../../../../src/infrastructure/container.js';
import { AffectedDoc } from '../../../../../../src/domain/doc.js';
import { DocsUpdateResult } from '../../../../../../src/application/use-cases/UpdateDocUseCase.js';
import { ExecutionContext } from '../../../../../../src/cli/tui/context/ExecutionContext.js';
import { ContainerContext } from '../../../../../../src/cli/tui/context/ContainerContext.js';
import { flushAsync } from '../../../helpers/flushAsync.js';

interface TestHarnessProps {
  options: UseUpdateDocModalOptions;
  onRender?: (ret: UseUpdateDocModalReturn) => void;
}

const TestHarness: React.FC<TestHarnessProps> = ({ options, onRender }) => {
  const result = useUpdateDocModal(options);
  onRender?.(result);
  return React.createElement(
    Text,
    null,
    `Step:${result.step}|Mode:${result.mode}|Intent:${result.selectedIntent}|Target:${result.selectedAutoTarget}`
  );
};

interface RenderHookOptions {
  options?: UseUpdateDocModalOptions;
  activeIntent?: string | null;
}

function renderHook(props: RenderHookOptions = {}) {
  let latestResult!: UseUpdateDocModalReturn;

  const getContainer = () => {
    return (
      props.options?.container ??
      ({
        listIntentsUseCase: { listNames: vi.fn().mockReturnValue(['tui', 'intents', 'auth']) },
        updateDocUseCase: { getAffectedDocs: vi.fn().mockReturnValue({ kind: 'no-affected-docs' }) },
      } as unknown as AppContainer)
    );
  };

  const container = getContainer();

  const renderComponent = (renderOpts: RenderHookOptions) => {
    const currentContainer = renderOpts.options?.container ?? container;
    return React.createElement(
      ContainerContext.Provider,
      { value: currentContainer },
      React.createElement(
        ExecutionContext.Provider,
        { value: { activeIntent: renderOpts.activeIntent ?? null } as any },
        React.createElement(TestHarness, {
          options: { container: currentContainer, ...renderOpts.options },
          onRender: (ret) => {
            latestResult = ret;
          },
        })
      )
    );
  };

  const renderResult = render(renderComponent(props));

  return {
    get current() {
      return latestResult;
    },
    rerender: (newProps: RenderHookOptions) => {
      renderResult.rerender(renderComponent(newProps));
    },
    lastFrame: renderResult.lastFrame,
    unmount: renderResult.unmount,
  };
}

describe('useUpdateDocModal hook', () => {
  const sampleAffectedDocs: AffectedDoc[] = [
    {
      docName: 'architecture',
      docPath: '.codeforge/docs/architecture.md',
      intentPaths: ['.codeforge/intents/tui.md'],
      matchedFiles: ['src/cli/tui/components/docs/DocsScreen.tsx', 'src/cli/tui/App.tsx'],
    },
    {
      docName: 'security',
      docPath: '.codeforge/docs/security.md',
      intentPaths: ['.codeforge/intents/tui.md'],
      matchedFiles: ['src/security/auth.ts'],
    },
  ];

  it('1. inicializa na etapa 1 e permite alternar modo de seleção', async () => {
    const hook = renderHook();

    expect(hook.current.step).toBe('mode-select');
    expect(hook.current.mode).toBe('direct');

    hook.current.handleCycleMode();
    await flushAsync();
    expect(hook.current.mode).toBe('auto');

    hook.current.handleCycleMode();
    await flushAsync();
    expect(hook.current.mode).toBe('direct');
  });

  it('2. avança para etapa 2A (modo direto), cicla intents e confirma seleção', async () => {
    const onConfirmDirect = vi.fn();
    const hook = renderHook({
      options: {
        initialStep: 'mode-select',
        initialMode: 'direct',
        availableIntents: ['intent1', 'intent2'],
        initialIntent: 'intent1',
        selectedDoc: { name: 'architecture.md' },
        onConfirmDirect,
      },
    });

    // Avança para direct
    await hook.current.handleConfirm();
    await flushAsync();
    expect(hook.current.step).toBe('direct');

    // Cicla intent
    hook.current.handleCycleIntent(1);
    await flushAsync();
    expect(hook.current.selectedIntent).toBe('intent2');

    // Confirma modo direto
    await hook.current.handleConfirm();
    await flushAsync();
    expect(onConfirmDirect).toHaveBeenCalledWith('architecture', 'intent2');
  });

  it('3. avança para etapa 2B (modo auto), detecta docs afetados e confirma seleção', async () => {
    const onConfirmAuto = vi.fn();
    const mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'affected-docs',
      affectedDocs: sampleAffectedDocs,
    });

    const container = {
      listIntentsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
      updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
    } as unknown as AppContainer;

    const hook = renderHook({
      options: {
        container,
        initialMode: 'auto',
        initialIntent: 'tui',
        onConfirmAuto,
      },
    });

    await hook.current.handleConfirm();
    await flushAsync();

    expect(hook.current.step).toBe('auto');
    expect(mockGetAffectedDocs).toHaveBeenCalledWith('tui');
    expect(hook.current.hasAffectedDocs).toBe(true);
    expect(hook.current.affectedDocs).toEqual(sampleAffectedDocs);

    // Cicla alvo para architecture (índice 1)
    hook.current.handleCycleAutoTarget(1);
    await flushAsync();
    expect(hook.current.selectedAutoTarget).toBe('architecture');

    // Confirma
    await hook.current.handleConfirm();
    await flushAsync();
    expect(onConfirmAuto).toHaveBeenCalledWith('tui', 'architecture', sampleAffectedDocs);
  });

  it('4. trata casos de borda no-git/no-affected em modo auto e bloqueia confirmação', async () => {
    const onConfirmAuto = vi.fn();
    const mockGetAffectedDocs = vi.fn().mockReturnValue({ kind: 'no-git' } as DocsUpdateResult);

    const container = {
      listIntentsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
      updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
    } as unknown as AppContainer;

    const hookPt = renderHook({
      options: {
        container,
        initialStep: 'auto',
        initialIntent: 'tui',
        language: 'pt',
        onConfirmAuto,
      },
    });

    await flushAsync();

    expect(hookPt.current.isNoGit).toBe(true);
    expect(hookPt.current.hasAffectedDocs).toBe(false);
    expect(hookPt.current.edgeCaseMessage).toBe('Repositório Git não encontrado.');

    const hookEn = renderHook({
      options: {
        container,
        initialStep: 'auto',
        initialIntent: 'tui',
        language: 'en',
        onConfirmAuto,
      },
    });

    await flushAsync();

    expect(hookEn.current.edgeCaseMessage).toBe('Git repository not found.');

    // Confirmação deve ser bloqueada
    await hookPt.current.handleConfirm();
    await flushAsync();
    expect(onConfirmAuto).not.toHaveBeenCalled();
  });

  it('5. navega de volta para etapa anterior ou encerra modal via handleBack', async () => {
    const onClose = vi.fn();
    const hook = renderHook({
      options: {
        initialStep: 'direct',
        onClose,
      },
    });

    expect(hook.current.step).toBe('direct');

    // De direct retorna para mode-select sem fechar o modal
    hook.current.handleBack();
    await flushAsync();
    expect(hook.current.step).toBe('mode-select');
    expect(onClose).not.toHaveBeenCalled();

    // De mode-select aciona onClose
    hook.current.handleBack();
    await flushAsync();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
