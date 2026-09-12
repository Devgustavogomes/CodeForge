import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useSpecsHotkeys,
  UseSpecsHotkeysProps,
} from '../../../../../../src/cli/tui/components/specs/hooks/useSpecsHotkeys.js';
import { flushAsync } from '../../../helpers/flushAsync.js';

interface HarnessProps extends Partial<UseSpecsHotkeysProps> {}

const TestHotkeysHarness: React.FC<HarnessProps> = (props) => {
  useSpecsHotkeys({
    onNavigateUp: props.onNavigateUp ?? vi.fn(),
    onNavigateDown: props.onNavigateDown ?? vi.fn(),
    onOpenRun: props.onOpenRun ?? vi.fn(),
    onOpenTasks: props.onOpenTasks,
    onGeneratePlan: props.onGeneratePlan ?? vi.fn(),
    onValidatePlan: props.onValidatePlan,
    onOpenCreateModal: props.onOpenCreateModal ?? vi.fn(),
    onOpenPullModal: props.onOpenPullModal ?? vi.fn(),
    isInteractive: props.isInteractive,
    isModalOpen: props.isModalOpen,
    isTextInputActive: props.isTextInputActive,
  });

  return React.createElement(Text, null, 'SpecsHotkeysTest');
};

describe('useSpecsHotkeys hook', () => {
  let callbacks: {
    onNavigateUp: ReturnType<typeof vi.fn>;
    onNavigateDown: ReturnType<typeof vi.fn>;
    onOpenRun: ReturnType<typeof vi.fn>;
    onOpenTasks: ReturnType<typeof vi.fn>;
    onGeneratePlan: ReturnType<typeof vi.fn>;
    onValidatePlan: ReturnType<typeof vi.fn>;
    onOpenCreateModal: ReturnType<typeof vi.fn>;
    onOpenPullModal: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    callbacks = {
      onNavigateUp: vi.fn(),
      onNavigateDown: vi.fn(),
      onOpenRun: vi.fn(),
      onOpenTasks: vi.fn(),
      onGeneratePlan: vi.fn(),
      onValidatePlan: vi.fn(),
      onOpenCreateModal: vi.fn(),
      onOpenPullModal: vi.fn(),
    };
  });

  describe('Atalhos de importação (Pull) e geração de plano', () => {
    it("dispara onOpenPullModal ao pressionar 'p' minúsculo e NÃO dispara onGeneratePlan", async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('p');
      await flushAsync();

      expect(callbacks.onOpenPullModal).toHaveBeenCalledTimes(1);
      expect(callbacks.onGeneratePlan).not.toHaveBeenCalled();
    });

    it("dispara onOpenPullModal ao pressionar 'P' maiúsculo e NÃO dispara onGeneratePlan", async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('P');
      await flushAsync();

      expect(callbacks.onOpenPullModal).toHaveBeenCalledTimes(1);
      expect(callbacks.onGeneratePlan).not.toHaveBeenCalled();
    });

    it("dispara onGeneratePlan exclusivamente ao pressionar 'g' ou 'G'", async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('g');
      await flushAsync();
      expect(callbacks.onGeneratePlan).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenPullModal).not.toHaveBeenCalled();

      stdin.write('G');
      await flushAsync();
      expect(callbacks.onGeneratePlan).toHaveBeenCalledTimes(2);
      expect(callbacks.onOpenPullModal).not.toHaveBeenCalled();
    });
  });

  describe('Atalhos de tarefas (Tasks)', () => {
    it("dispara onOpenTasks ao pressionar 't' e 'T'", async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('t');
      await flushAsync();
      expect(callbacks.onOpenTasks).toHaveBeenCalledTimes(1);

      stdin.write('T');
      await flushAsync();
      expect(callbacks.onOpenTasks).toHaveBeenCalledTimes(2);
    });

    it("não lança erro quando onOpenTasks não for fornecido e 't' for pressionado", async () => {
      const { onOpenTasks: _, ...propsWithoutTasks } = callbacks;
      const { stdin } = render(React.createElement(TestHotkeysHarness, propsWithoutTasks));

      stdin.write('t');
      await flushAsync();
      stdin.write('T');
      await flushAsync();
    });
  });

  describe('Atalhos de criação e validação', () => {
    it("dispara onOpenCreateModal ao pressionar 'c' ou 'C'", async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('c');
      await flushAsync();
      expect(callbacks.onOpenCreateModal).toHaveBeenCalledTimes(1);

      stdin.write('C');
      await flushAsync();
      expect(callbacks.onOpenCreateModal).toHaveBeenCalledTimes(2);
    });

    it("dispara onValidatePlan ao pressionar 'v' ou 'V'", async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('v');
      await flushAsync();
      expect(callbacks.onValidatePlan).toHaveBeenCalledTimes(1);

      stdin.write('V');
      await flushAsync();
      expect(callbacks.onValidatePlan).toHaveBeenCalledTimes(2);
    });

    it("não lança erro quando onValidatePlan não for fornecido e 'v' for pressionado", async () => {
      const { onValidatePlan: _, ...propsWithoutValidate } = callbacks;
      const { stdin } = render(React.createElement(TestHotkeysHarness, propsWithoutValidate));

      stdin.write('v');
      await flushAsync();
      stdin.write('V');
      await flushAsync();
    });
  });

  describe('Atalhos de execução (Run)', () => {
    it('dispara onOpenRun ao pressionar Enter (\\r ou \\n)', async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('\r');
      await flushAsync();
      expect(callbacks.onOpenRun).toHaveBeenCalledTimes(1);

      stdin.write('\n');
      await flushAsync();
      expect(callbacks.onOpenRun).toHaveBeenCalledTimes(2);
    });
  });

  describe('Navegação vertical', () => {
    it('dispara onNavigateUp com seta para cima e com tecla k', async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('\u001B[A');
      await flushAsync();
      expect(callbacks.onNavigateUp).toHaveBeenCalledTimes(1);

      stdin.write('k');
      await flushAsync();
      expect(callbacks.onNavigateUp).toHaveBeenCalledTimes(2);
    });

    it('dispara onNavigateDown com seta para baixo e com tecla j', async () => {
      const { stdin } = render(React.createElement(TestHotkeysHarness, callbacks));

      stdin.write('\u001B[B');
      await flushAsync();
      expect(callbacks.onNavigateDown).toHaveBeenCalledTimes(1);

      stdin.write('j');
      await flushAsync();
      expect(callbacks.onNavigateDown).toHaveBeenCalledTimes(2);
    });
  });

  describe('Bloqueio e desativação de inputs', () => {
    it('não dispara nenhuma callback quando isInteractive é false', async () => {
      const { stdin } = render(
        React.createElement(TestHotkeysHarness, {
          ...callbacks,
          isInteractive: false,
        })
      );

      stdin.write('p');
      stdin.write('P');
      stdin.write('g');
      stdin.write('t');
      stdin.write('c');
      stdin.write('v');
      stdin.write('\r');
      stdin.write('k');
      stdin.write('j');
      stdin.write('\u001B[A');
      stdin.write('\u001B[B');
      await flushAsync();

      expect(callbacks.onOpenPullModal).not.toHaveBeenCalled();
      expect(callbacks.onGeneratePlan).not.toHaveBeenCalled();
      expect(callbacks.onOpenTasks).not.toHaveBeenCalled();
      expect(callbacks.onOpenCreateModal).not.toHaveBeenCalled();
      expect(callbacks.onValidatePlan).not.toHaveBeenCalled();
      expect(callbacks.onOpenRun).not.toHaveBeenCalled();
      expect(callbacks.onNavigateUp).not.toHaveBeenCalled();
      expect(callbacks.onNavigateDown).not.toHaveBeenCalled();
    });

    it('não dispara nenhuma callback quando isModalOpen é true', async () => {
      const { stdin } = render(
        React.createElement(TestHotkeysHarness, {
          ...callbacks,
          isModalOpen: true,
        })
      );

      stdin.write('p');
      stdin.write('P');
      stdin.write('g');
      stdin.write('t');
      stdin.write('c');
      stdin.write('v');
      stdin.write('\r');
      stdin.write('k');
      stdin.write('j');
      await flushAsync();

      expect(callbacks.onOpenPullModal).not.toHaveBeenCalled();
      expect(callbacks.onGeneratePlan).not.toHaveBeenCalled();
      expect(callbacks.onOpenTasks).not.toHaveBeenCalled();
      expect(callbacks.onOpenCreateModal).not.toHaveBeenCalled();
      expect(callbacks.onValidatePlan).not.toHaveBeenCalled();
      expect(callbacks.onOpenRun).not.toHaveBeenCalled();
      expect(callbacks.onNavigateUp).not.toHaveBeenCalled();
      expect(callbacks.onNavigateDown).not.toHaveBeenCalled();
    });

    it('não dispara nenhuma callback quando isTextInputActive é true', async () => {
      const { stdin } = render(
        React.createElement(TestHotkeysHarness, {
          ...callbacks,
          isTextInputActive: true,
        })
      );

      stdin.write('p');
      stdin.write('P');
      stdin.write('g');
      stdin.write('t');
      stdin.write('c');
      stdin.write('v');
      stdin.write('\r');
      stdin.write('k');
      stdin.write('j');
      await flushAsync();

      expect(callbacks.onOpenPullModal).not.toHaveBeenCalled();
      expect(callbacks.onGeneratePlan).not.toHaveBeenCalled();
      expect(callbacks.onOpenTasks).not.toHaveBeenCalled();
      expect(callbacks.onOpenCreateModal).not.toHaveBeenCalled();
      expect(callbacks.onValidatePlan).not.toHaveBeenCalled();
      expect(callbacks.onOpenRun).not.toHaveBeenCalled();
      expect(callbacks.onNavigateUp).not.toHaveBeenCalled();
      expect(callbacks.onNavigateDown).not.toHaveBeenCalled();
    });
  });
});
