import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useUpdateDocModal,
  cleanDocName,
  cleanSpecName,
  determineInitialSpec,
  UseUpdateDocModalOptions,
  UseUpdateDocModalReturn,
} from '../../../../../../src/cli/tui/components/docs/hooks/useUpdateDocModal.js';
import { AppContainer } from '../../../../../../src/infrastructure/container.js';
import { AffectedDoc } from '../../../../../../src/domain/doc.js';
import { DocsUpdateResult } from '../../../../../../src/application/use-cases/UpdateDocUseCase.js';
import { ExecutionContext } from '../../../../../../src/cli/tui/context/ExecutionContext.js';
import { ContainerContext } from '../../../../../../src/cli/tui/context/ContainerContext.js';

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

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
    `Step:${result.step}|Mode:${result.mode}|Spec:${result.selectedSpec}|Target:${result.selectedAutoTarget}`
  );
};

interface RenderHookOptions {
  options?: UseUpdateDocModalOptions;
  activeSpec?: string | null;
}

function renderHook(props: RenderHookOptions = {}) {
  let latestResult!: UseUpdateDocModalReturn;

  const getContainer = () => {
    return (
      props.options?.container ??
      ({
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui', 'specs', 'auth']) },
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
        { value: { activeSpec: renderOpts.activeSpec ?? null } as any },
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
      specPaths: ['.codeforge/specs/tui.md'],
      matchedFiles: ['src/cli/tui/components/docs/DocsScreen.tsx', 'src/cli/tui/App.tsx'],
    },
    {
      docName: 'security',
      docPath: '.codeforge/docs/security.md',
      specPaths: ['.codeforge/specs/tui.md'],
      matchedFiles: ['src/security/auth.ts'],
    },
  ];

  describe('Utilitários de formatação e resolução de specs', () => {
    it('cleanDocName remove extensão .md e espaços extras', () => {
      expect(cleanDocName('architecture.md')).toBe('architecture');
      expect(cleanDocName('architecture.MD')).toBe('architecture');
      expect(cleanDocName('  design  ')).toBe('design');
      expect(cleanDocName('')).toBe('');
      expect(cleanDocName(null)).toBe('');
    });

    it('cleanSpecName remove caminhos, prefixos e extensão .md', () => {
      expect(cleanSpecName('.codeforge/specs/tui.md')).toBe('tui');
      expect(cleanSpecName('specs\\auth.md')).toBe('auth');
      expect(cleanSpecName('system-design')).toBe('system-design');
      expect(cleanSpecName('')).toBe('');
      expect(cleanSpecName(undefined)).toBe('');
    });

    it('determineInitialSpec respeita a ordem de precedência', () => {
      // 1. initialSpec tem prioridade absoluta
      expect(
        determineInitialSpec('spec-a', 'spec-b', ['spec-c'], ['spec-d'])
      ).toBe('spec-a');

      // 2. activeSpec da sessão tem prioridade se initialSpec estiver ausente
      expect(
        determineInitialSpec(undefined, 'spec-b', ['spec-c'], ['spec-d'])
      ).toBe('spec-b');

      // 3. Primeira spec associada ao doc tem prioridade se initial e session ausentes
      expect(
        determineInitialSpec(undefined, null, ['.codeforge/specs/doc-spec.md'], ['spec-d'])
      ).toBe('doc-spec');

      // 4. Primeira de availableSpecs se nenhuma anterior existir
      expect(
        determineInitialSpec(undefined, null, [], ['fallback-spec', 'other'])
      ).toBe('fallback-spec');

      // 5. Fallback vazio se nada for encontrado
      expect(determineInitialSpec(undefined, null, undefined, [])).toBe('');
    });
  });

  describe('1. Inicialização e Estado Inicial', () => {
    it('inicializa na etapa "mode-select" com modo "direct" pré-selecionado', () => {
      const hook = renderHook();

      expect(hook.current.step).toBe('mode-select');
      expect(hook.current.mode).toBe('direct');
      expect(hook.current.autoSelectedIndex).toBe(0);
      expect(hook.current.affectedResult).toBeNull();
      expect(hook.current.affectedDocs).toEqual([]);
      expect(hook.current.hasAffectedDocs).toBe(false);
      expect(hook.current.isNoGit).toBe(false);
      expect(hook.current.isNoChangedFiles).toBe(false);
      expect(hook.current.isNoAffectedDocs).toBe(false);
      expect(hook.current.edgeCaseMessage).toBeNull();
    });

    it('respeita initialStep e initialMode quando fornecidos nas opções', () => {
      const hook = renderHook({
        options: {
          initialStep: 'direct',
          initialMode: 'auto',
        },
      });

      expect(hook.current.step).toBe('direct');
      expect(hook.current.mode).toBe('auto');
    });

    it('disponibiliza targetDocName e targetDocDisplayName a partir de selectedDoc', () => {
      const hook = renderHook({
        options: {
          selectedDoc: {
            name: 'architecture.md',
            path: '.codeforge/docs/architecture.md',
            specs: [],
            scope: [],
            createdAt: '2026-09-01',
            updatedAt: '2026-09-02',
            existsOnDisk: true,
            inManifest: true,
          },
        },
      });

      expect(hook.current.targetDocName).toBe('architecture');
      expect(hook.current.targetDocDisplayName).toBe('architecture.md');
    });
  });

  describe('2. Pré-seleção da Especificação de Referência', () => {
    it('pré-seleciona initialSpec se fornecida nas opções', () => {
      const hook = renderHook({
        options: {
          initialSpec: '.codeforge/specs/my-spec.md',
          availableSpecs: ['tui', 'my-spec'],
        },
      });

      expect(hook.current.selectedSpec).toBe('my-spec');
    });

    it('pré-seleciona activeSpec do ExecutionContext se initialSpec não fornecida', () => {
      const hook = renderHook({
        activeSpec: 'session-active-spec',
        options: {
          availableSpecs: ['session-active-spec', 'other'],
        },
      });

      expect(hook.current.selectedSpec).toBe('session-active-spec');
    });

    it('pré-seleciona a primeira spec associada ao doc no manifest se sessão e initialSpec forem nulos', () => {
      const hook = renderHook({
        activeSpec: null,
        options: {
          selectedDoc: {
            name: 'architecture',
            specs: ['.codeforge/specs/doc-manifest-spec.md'],
          },
          availableSpecs: ['doc-manifest-spec', 'other'],
        },
      });

      expect(hook.current.selectedSpec).toBe('doc-manifest-spec');
    });

    it('pré-seleciona a primeira de availableSpecs como último recurso', () => {
      const hook = renderHook({
        activeSpec: null,
        options: {
          availableSpecs: ['first-spec', 'second-spec'],
        },
      });

      expect(hook.current.selectedSpec).toBe('first-spec');
    });
  });

  describe('3. Alternância e Ciclo de Modo na Etapa 1', () => {
    it('alterna entre modos direto e automático via handleCycleMode', async () => {
      const hook = renderHook();

      expect(hook.current.mode).toBe('direct');

      hook.current.handleCycleMode();
      await tick();
      expect(hook.current.mode).toBe('auto');

      hook.current.handleCycleMode();
      await tick();
      expect(hook.current.mode).toBe('direct');
    });

    it('define o modo diretamente com handleSelectMode e setMode', async () => {
      const hook = renderHook();

      hook.current.handleSelectMode('auto');
      await tick();
      expect(hook.current.mode).toBe('auto');

      hook.current.setMode('direct');
      await tick();
      expect(hook.current.mode).toBe('direct');
    });
  });

  describe('4. Transições de Etapa na Confirmação (handleConfirm)', () => {
    it('avança da etapa mode-select para direct quando mode="direct"', async () => {
      const onConfirmDirect = vi.fn();
      const onConfirmAuto = vi.fn();

      const hook = renderHook({
        options: {
          initialMode: 'direct',
          onConfirmDirect,
          onConfirmAuto,
        },
      });

      expect(hook.current.step).toBe('mode-select');

      await hook.current.handleConfirm();
      await tick();

      expect(hook.current.step).toBe('direct');
      // Não deve disparar os callbacks de confirmação final na Etapa 1
      expect(onConfirmDirect).not.toHaveBeenCalled();
      expect(onConfirmAuto).not.toHaveBeenCalled();
    });

    it('avança da etapa mode-select para auto quando mode="auto" e dispara getAffectedDocs', async () => {
      const mockGetAffectedDocs = vi.fn().mockReturnValue({
        kind: 'affected-docs',
        affectedDocs: sampleAffectedDocs,
      });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialMode: 'auto',
          initialSpec: 'tui',
        },
      });

      await hook.current.handleConfirm();
      await tick();

      expect(hook.current.step).toBe('auto');
      expect(mockGetAffectedDocs).toHaveBeenCalledWith('tui');
      expect(hook.current.affectedDocs).toEqual(sampleAffectedDocs);
      expect(hook.current.hasAffectedDocs).toBe(true);
    });
  });

  describe('5. Etapa 2A (Modo Direto) e Ciclo de Specs', () => {
    it('cicla entre especificações com handleCycleSpec em avanço e retrocesso', async () => {
      const hook = renderHook({
        options: {
          initialStep: 'direct',
          availableSpecs: ['spec1', 'spec2', 'spec3'],
          initialSpec: 'spec1',
        },
      });

      expect(hook.current.selectedSpec).toBe('spec1');

      // Avançar
      hook.current.handleCycleSpec(1);
      await tick();
      expect(hook.current.selectedSpec).toBe('spec2');

      hook.current.handleCycleSpec(1);
      await tick();
      expect(hook.current.selectedSpec).toBe('spec3');

      // Wrap-around para o primeiro
      hook.current.handleCycleSpec(1);
      await tick();
      expect(hook.current.selectedSpec).toBe('spec1');

      // Retroceder para o último
      hook.current.handleCycleSpec(-1);
      await tick();
      expect(hook.current.selectedSpec).toBe('spec3');
    });

    it('dispara onConfirmDirect e onConfirm com docName e specName ao confirmar na etapa direct', async () => {
      const onConfirmDirect = vi.fn();
      const onConfirm = vi.fn();

      const hook = renderHook({
        options: {
          initialStep: 'direct',
          initialSpec: 'tui',
          selectedDoc: { name: 'architecture.md' },
          onConfirmDirect,
          onConfirm,
        },
      });

      await hook.current.handleConfirm();
      await tick();

      expect(onConfirmDirect).toHaveBeenCalledWith('architecture', 'tui');
      expect(onConfirm).toHaveBeenCalledWith({
        mode: 'direct',
        docName: 'architecture',
        specName: 'tui',
      });
    });
  });

  describe('6. Etapa 2B (Modo Automático) - Casos de Borda do Git e Resolução', () => {
    it('trata caso de borda "no-git" corretamente e bloqueia confirmação', async () => {
      const onConfirmAuto = vi.fn();
      const mockGetAffectedDocs = vi.fn().mockReturnValue({ kind: 'no-git' } as DocsUpdateResult);

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
          onConfirmAuto,
        },
      });

      await tick();

      expect(hook.current.isNoGit).toBe(true);
      expect(hook.current.hasAffectedDocs).toBe(false);
      expect(hook.current.edgeCaseMessage).toBe('Repositório Git não encontrado.');

      // Tentativa de confirmação sem documentos afetados deve ser ignorada
      await hook.current.handleConfirm();
      await tick();
      expect(onConfirmAuto).not.toHaveBeenCalled();
    });

    it('trata caso de borda "no-changed-files" com alerta adequado', async () => {
      const mockGetAffectedDocs = vi.fn().mockReturnValue({ kind: 'no-changed-files' });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
        },
      });

      await tick();

      expect(hook.current.isNoChangedFiles).toBe(true);
      expect(hook.current.edgeCaseMessage).toBe('Nenhum arquivo modificado no Git.');
    });

    it('trata caso de borda "no-affected-docs" quando nada dá match no escopo', async () => {
      const mockGetAffectedDocs = vi.fn().mockReturnValue({ kind: 'no-affected-docs' });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
        },
      });

      await tick();

      expect(hook.current.isNoAffectedDocs).toBe(true);
      expect(hook.current.edgeCaseMessage).toBe(
        'Nenhum documento do manifest cobre os arquivos modificados.'
      );
    });

    it('trata caso "spec-not-found" adequadamente', async () => {
      const mockGetAffectedDocs = vi.fn().mockReturnValue({ kind: 'spec-not-found' });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['missing-spec']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'missing-spec',
        },
      });

      await tick();

      expect(hook.current.edgeCaseMessage).toBe('Especificação "missing-spec" não encontrada.');
    });
  });

  describe('7. Etapa 2B (Modo Automático) - Seleção de Alvo e Confirmação', () => {
    it('inicia com alvo "all" e cicla entre todos e documentos individuais', async () => {
      const mockGetAffectedDocs = vi.fn().mockReturnValue({
        kind: 'affected-docs',
        affectedDocs: sampleAffectedDocs,
      });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
        },
      });

      await tick();

      // Padrão: todos (índice 0)
      expect(hook.current.autoSelectedIndex).toBe(0);
      expect(hook.current.selectedAutoTarget).toBe('all');
      expect(hook.current.selectedAffectedDoc).toBeNull();

      // Cicla para o primeiro doc afetado (índice 1: architecture)
      hook.current.handleCycleAutoTarget(1);
      await tick();
      expect(hook.current.autoSelectedIndex).toBe(1);
      expect(hook.current.selectedAutoTarget).toBe('architecture');
      expect(hook.current.selectedAffectedDoc?.docName).toBe('architecture');

      // Cicla para o segundo doc afetado (índice 2: security)
      hook.current.handleCycleAutoTarget(1);
      await tick();
      expect(hook.current.autoSelectedIndex).toBe(2);
      expect(hook.current.selectedAutoTarget).toBe('security');
      expect(hook.current.selectedAffectedDoc?.docName).toBe('security');

      // Wrap-around de volta para 'all' (índice 0)
      hook.current.handleCycleAutoTarget(1);
      await tick();
      expect(hook.current.autoSelectedIndex).toBe(0);
      expect(hook.current.selectedAutoTarget).toBe('all');

      // Ciclo reverso para o último doc
      hook.current.handleCycleAutoTarget(-1);
      await tick();
      expect(hook.current.autoSelectedIndex).toBe(2);
      expect(hook.current.selectedAutoTarget).toBe('security');
    });

    it('permite selecionar índice de alvo diretamente com setAutoSelectedIndex', async () => {
      const mockGetAffectedDocs = vi.fn().mockReturnValue({
        kind: 'affected-docs',
        affectedDocs: sampleAffectedDocs,
      });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
        },
      });

      await tick();

      hook.current.setAutoSelectedIndex(1);
      await tick();
      expect(hook.current.selectedAutoTarget).toBe('architecture');

      hook.current.setAutoSelectedIndex(0);
      await tick();
      expect(hook.current.selectedAutoTarget).toBe('all');
    });

    it('dispara onConfirmAuto e onConfirm com "all" ao confirmar quando autoSelectedIndex é 0', async () => {
      const onConfirmAuto = vi.fn();
      const onConfirm = vi.fn();
      const mockGetAffectedDocs = vi.fn().mockReturnValue({
        kind: 'affected-docs',
        affectedDocs: sampleAffectedDocs,
      });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
          onConfirmAuto,
          onConfirm,
        },
      });

      await tick();

      await hook.current.handleConfirm();
      await tick();

      expect(onConfirmAuto).toHaveBeenCalledWith('tui', 'all', sampleAffectedDocs);
      expect(onConfirm).toHaveBeenCalledWith({
        mode: 'auto',
        specName: 'tui',
        target: 'all',
        affectedDocs: sampleAffectedDocs,
      });
    });

    it('dispara onConfirmAuto e onConfirm com nome do doc específico ao confirmar', async () => {
      const onConfirmAuto = vi.fn();
      const onConfirm = vi.fn();
      const mockGetAffectedDocs = vi.fn().mockReturnValue({
        kind: 'affected-docs',
        affectedDocs: sampleAffectedDocs,
      });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
          onConfirmAuto,
          onConfirm,
        },
      });

      await tick();

      // Seleciona security (índice 2)
      hook.current.setAutoSelectedIndex(2);
      await tick();

      await hook.current.handleConfirm();
      await tick();

      expect(onConfirmAuto).toHaveBeenCalledWith('tui', 'security', sampleAffectedDocs);
      expect(onConfirm).toHaveBeenCalledWith({
        mode: 'auto',
        specName: 'tui',
        target: 'security',
        affectedDocs: sampleAffectedDocs,
      });
    });

    it('re-executa getAffectedDocs e reseta seleção de alvo ao ciclar spec em modo auto', async () => {
      const mockGetAffectedDocs = vi.fn().mockImplementation((spec: string) => {
        if (spec === 'tui') {
          return { kind: 'affected-docs', affectedDocs: sampleAffectedDocs };
        }
        return { kind: 'no-affected-docs' };
      });

      const container = {
        listSpecsUseCase: { listNames: vi.fn().mockReturnValue(['tui', 'other-spec']) },
        updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
      } as unknown as AppContainer;

      const hook = renderHook({
        options: {
          container,
          initialStep: 'auto',
          initialSpec: 'tui',
          availableSpecs: ['tui', 'other-spec'],
        },
      });

      await tick();

      expect(hook.current.affectedDocs.length).toBe(2);

      // Altera a spec ativa para 'other-spec'
      hook.current.handleCycleSpec(1);
      await tick();

      expect(hook.current.selectedSpec).toBe('other-spec');
      expect(mockGetAffectedDocs).toHaveBeenCalledWith('other-spec');
      expect(hook.current.isNoAffectedDocs).toBe(true);
      expect(hook.current.autoSelectedIndex).toBe(0);
    });
  });

  describe('8. Retrocesso e Encerramento (handleBack)', () => {
    it('retorna da etapa "direct" para "mode-select" sem chamar onClose', async () => {
      const onClose = vi.fn();
      const hook = renderHook({
        options: {
          initialStep: 'direct',
          onClose,
        },
      });

      expect(hook.current.step).toBe('direct');

      hook.current.handleBack();
      await tick();

      expect(hook.current.step).toBe('mode-select');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('retorna da etapa "auto" para "mode-select" sem chamar onClose', async () => {
      const onClose = vi.fn();
      const hook = renderHook({
        options: {
          initialStep: 'auto',
          onClose,
        },
      });

      expect(hook.current.step).toBe('auto');

      hook.current.handleBack();
      await tick();

      expect(hook.current.step).toBe('mode-select');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('chama onClose quando handleBack é acionado na etapa "mode-select"', async () => {
      const onClose = vi.fn();
      const hook = renderHook({
        options: {
          initialStep: 'mode-select',
          onClose,
        },
      });

      expect(hook.current.step).toBe('mode-select');

      hook.current.handleBack();
      await tick();

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('9. Reset de Estado', () => {
    it('restaura estados padrão ao chamar reset()', async () => {
      const hook = renderHook({
        options: {
          availableSpecs: ['spec1', 'spec2'],
          initialSpec: 'spec1',
        },
      });

      // Altera modo, etapa e seleção
      hook.current.setMode('auto');
      hook.current.setStep('auto');
      hook.current.setAutoSelectedIndex(2);
      hook.current.setSelectedSpec('spec2');
      await tick();

      expect(hook.current.step).toBe('auto');
      expect(hook.current.mode).toBe('auto');
      expect(hook.current.selectedSpec).toBe('spec2');

      hook.current.reset();
      await tick();

      expect(hook.current.step).toBe('mode-select');
      expect(hook.current.mode).toBe('direct');
      expect(hook.current.autoSelectedIndex).toBe(0);
      expect(hook.current.selectedSpec).toBe('spec1');
    });

    it('reseta o estado quando isOpen alterna de false para true', async () => {
      const hook = renderHook({
        options: {
          isOpen: false,
          availableSpecs: ['spec1'],
          initialSpec: 'spec1',
        },
      });

      hook.current.setMode('auto');
      hook.current.setStep('auto');
      await tick();
      expect(hook.current.step).toBe('auto');

      // Reabre modal
      hook.rerender({
        options: {
          isOpen: true,
          availableSpecs: ['spec1'],
          initialSpec: 'spec1',
        },
      });
      await tick();

      expect(hook.current.step).toBe('mode-select');
      expect(hook.current.mode).toBe('direct');
    });
  });
});
