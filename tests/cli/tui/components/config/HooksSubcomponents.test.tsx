import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';
import {
  HooksEventList,
  EVENT_DESCRIPTIONS,
} from '../../../../../src/cli/tui/components/config/components/HooksEventList.js';
import { HooksCommandList } from '../../../../../src/cli/tui/components/config/components/HooksCommandList.js';
import { HookForm } from '../../../../../src/cli/tui/components/config/components/HookForm.js';
import { HOOK_EVENTS, HookMap } from '../../../../../src/domain/hook.js';

describe('Hooks Subcomponents (TASK-001)', () => {
  describe('HooksEventList (Nível 1)', () => {
    const mockHooks: HookMap = {
      'run.started': [{ name: 'setup', run: 'npm run setup', type: 'notify' }],
      'task.verify': [
        { name: 'lint', run: 'npm run lint', type: 'gate' },
        { name: 'test', run: 'npm test', type: 'gate' },
      ],
    };

    it('renders header and context subtitle', () => {
      const { lastFrame } = renderWithProviders(
        <HooksEventList hooks={mockHooks} selectedIndex={0} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Configuração de Hooks - Selecione o Evento');
      expect(output).toContain(
        'Selecione um evento de ciclo de vida para gerenciar seus comandos associados.'
      );
    });

    it('renders all 8 lifecycle events from HOOK_EVENTS with badges and descriptions', () => {
      const { lastFrame } = renderWithProviders(
        <HooksEventList hooks={mockHooks} selectedIndex={0} />
      );
      const output = lastFrame() ?? '';

      for (const event of HOOK_EVENTS) {
        expect(output).toContain(event);
        expect(output).toContain(EVENT_DESCRIPTIONS[event]);
      }

      // Check badges
      expect(output).toContain('[1 hook]');
      expect(output).toContain('[2 hooks]');
      expect(output).toContain('[nenhum]');
    });

    it('renders navigation shortcut bar', () => {
      const { lastFrame } = renderWithProviders(
        <HooksEventList hooks={mockHooks} selectedIndex={0} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[↑/↓ ou k/j] Navegar');
      expect(output).toContain('[Enter ou →] Selecionar');
      expect(output).toContain('[Esc/q] Voltar');
    });

    it('highlights the selected event cursor', () => {
      const { lastFrame } = renderWithProviders(
        <HooksEventList hooks={mockHooks} selectedIndex={1} />
      );
      const output = lastFrame() ?? '';

      // Cursor indicates index 1 (run.completed)
      expect(output).toContain('run.completed');
    });
  });

  describe('HooksCommandList (Nível 2)', () => {
    const mockCommands = [
      { name: 'lint', run: 'npm run lint -- --max-warnings=0', type: 'gate' as const },
      { name: 'notify-slack', run: 'curl -X POST https://slack.com', type: 'notify' as const },
    ];

    it('renders header with event name and description', () => {
      const { lastFrame } = renderWithProviders(
        <HooksCommandList
          event="task.verify"
          commands={mockCommands}
          selectedIndex={0}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Hooks do Evento: task.verify');
      expect(output).toContain(EVENT_DESCRIPTIONS['task.verify']);
    });

    it('renders [+ Adicionar Novo Comando] as the first selectable item', () => {
      const { lastFrame } = renderWithProviders(
        <HooksCommandList
          event="task.verify"
          commands={mockCommands}
          selectedIndex={0}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[+ Adicionar Novo Comando]');
    });

    it('renders command list with order number, type badges, bold name and run command', () => {
      const { lastFrame } = renderWithProviders(
        <HooksCommandList
          event="task.verify"
          commands={mockCommands}
          selectedIndex={1}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('1.');
      expect(output).toContain('[GATE]');
      expect(output).toContain('lint');
      expect(output).toContain('npm run lint');

      expect(output).toContain('2.');
      expect(output).toContain('[NOTIFY]');
      expect(output).toContain('notify-slack');
      expect(output).toContain('curl -X POST');
    });

    it('renders deletion confirmation prompt when deleteConfirmIndex is set', () => {
      const { lastFrame } = renderWithProviders(
        <HooksCommandList
          event="task.verify"
          commands={mockCommands}
          selectedIndex={1}
          deleteConfirmIndex={0}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Excluir este comando? [y/N]');
    });

    it('renders deletion confirmation prompt when isDeleting is true', () => {
      const { lastFrame } = renderWithProviders(
        <HooksCommandList
          event="task.verify"
          commands={mockCommands}
          selectedIndex={1}
          isDeleting={true}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Excluir este comando? [y/N]');
    });

    it('renders shortcuts bar', () => {
      const { lastFrame } = renderWithProviders(
        <HooksCommandList
          event="task.verify"
          commands={mockCommands}
          selectedIndex={0}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[↑/↓] Navegar');
      expect(output).toContain('[Enter] Selecionar/Editar');
      expect(output).toContain('[e] Editar');
      expect(output).toContain('[d] Excluir');
      expect(output).toContain('[Esc ou ←] Voltar');
    });
  });

  describe('HookForm (Nível 3)', () => {
    it('renders header, 3 fields, and save button', () => {
      const { lastFrame } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="run"
          run="pytest"
          type="gate"
          name="unit-tests"
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Adicionar Novo Hook — task.verify');
      expect(output).toContain('Comando (run) *:');
      expect(output).toContain('pytest');
      expect(output).toContain('Tipo (type):');
      expect(output).toContain('[GATE]');
      expect(output).toContain('Nome (name):');
      expect(output).toContain('unit-tests');
      expect(output).toContain('[ Salvar Hook ]');
    });

    it('shows contextual explanation for gate and notify', () => {
      const { lastFrame: lastFrameGate } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="type"
          type="gate"
        />
      );
      expect(lastFrameGate() ?? '').toContain(
        'gate: Falha no comando interrompe e veta a tarefa'
      );

      const { lastFrame: lastFrameNotify } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="type"
          type="notify"
        />
      );
      expect(lastFrameNotify() ?? '').toContain(
        'notify: Informa o resultado nos logs sem interromper'
      );
    });

    it('displays auto-derived placeholder when name is empty', () => {
      const { lastFrame } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="name"
          run="pytest tests/unit"
          name=""
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('pytest');
    });

    it('highlights save button when activeField is save', () => {
      const { lastFrame } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="save"
          run="npm test"
          type="gate"
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('▶ [ Salvar Hook ] ◀');
    });

    it('renders error message when present', () => {
      const { lastFrame } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="run"
          errorMessage="O comando (run) é obrigatório."
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('✗ O comando (run) é obrigatório.');
    });

    it('renders shortcuts bar', () => {
      const { lastFrame } = renderWithProviders(
        <HookForm
          event="task.verify"
          activeField="run"
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[Tab / Shift+Tab ou ↑/↓] Alternar campo');
      expect(output).toContain('[Space ou ←/→] Alternar tipo');
      expect(output).toContain('[Enter] Salvar');
      expect(output).toContain('[Esc] Cancelar');
    });
  });
});
