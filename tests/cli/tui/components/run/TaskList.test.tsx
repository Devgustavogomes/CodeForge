import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskList,
  areTaskRowPropsEqual,
  formatDuration,
} from '../../../../../src/cli/tui/components/run/TaskList.js';
import { TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';
import {
  SPINNER_FRAMES,
  resetSharedSpinnerTicker,
} from '../../../../../src/cli/tui/components/common/Spinner.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TaskList - Lista de Tarefas de Execução (BDD)', () => {
  beforeEach(() => {
    resetSharedSpinnerTicker();
  });

  afterEach(() => {
    resetSharedSpinnerTicker();
  });

  const mockTasks: TaskItem[] = [
    {
      id: 'TASK-001',
      title: 'Initial setup',
      status: 'completed',
      dependencies: [],
      startedAt: '2026-09-06T10:00:00.000Z',
      completedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-002',
      title: 'Build feature',
      status: 'running',
      dependencies: ['TASK-001'],
      startedAt: '2026-09-06T10:00:05.000Z',
    },
    {
      id: 'TASK-003',
      title: 'Run tests',
      status: 'failed',
      dependencies: ['TASK-002'],
      startedAt: '2026-09-06T10:00:10.000Z',
      completedAt: '2026-09-06T10:00:12.000Z',
      errors: ['Test failed'],
    },
    {
      id: 'TASK-004',
      title: 'Deploy to prod',
      status: 'pending',
      dependencies: ['TASK-003'],
    },
  ];

  describe('Renderização e Contadores de Tarefas', () => {
    it('ao carregar tarefas, exibe lista com ícones de status, durações, IDs e títulos', () => {
      const { lastFrame } = renderWithProviders(
        <TaskList tasks={mockTasks} selectedTaskId="TASK-001" isFocused={false} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Tasks (4)');
      expect(output).toContain('TASK-001');
      expect(output).toContain('Initial setup');
      expect(output).toContain('✓');
      expect(output).toContain('5s');

      expect(output).toContain('TASK-002');
      expect(output).toContain('Build feature');
      expect(output).toContain(SPINNER_FRAMES[0]);

      expect(output).toContain('TASK-003');
      expect(output).toContain('Run tests');
      expect(output).toContain('✗');
      expect(output).toContain('2s');

      expect(output).toContain('TASK-004');
      expect(output).toContain('Deploy to prod');
      expect(output).toContain('●');
    });

    it('exibe badges de filtro com contagem consolidada por status', () => {
      const { lastFrame } = renderWithProviders(
        <TaskList tasks={mockTasks} selectedTaskId="TASK-001" showFilterBadges={true} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[All: 4]');
      expect(output).toContain('[▶ Running: 1]');
      expect(output).toContain('[✗ Failed: 1]');
      expect(output).toContain('[✓ Done: 1]');
    });

    it('formata durações de tarefas de forma precisa consumindo o formatador unificado', () => {
      expect(formatDuration(undefined, undefined)).toBe('-');
      expect(
        formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T10:00:00.500Z')
      ).toBe('500ms');
      expect(
        formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T10:00:15.000Z')
      ).toBe('15s');
      expect(
        formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T10:02:30.000Z')
      ).toBe('2m 30s');
      expect(
        formatDuration('2026-09-06T10:00:00.000Z', '2026-09-06T11:02:30.000Z')
      ).toBe('1h 2m 30s');
    });
  });

  describe('Navegação e Seleção de Tarefas', () => {
    it('ao pressionar setas ou teclas j/k, navega e seleciona a tarefa correspondente', () => {
      const onSelectTask = vi.fn();
      const { stdin } = renderWithProviders(
        <TaskList
          tasks={mockTasks}
          selectedTaskId="TASK-001"
          onSelectTask={onSelectTask}
          isFocused={true}
        />
      );

      // Down arrow to move to TASK-002
      stdin.write('\u001B[B');
      expect(onSelectTask).toHaveBeenCalledWith('TASK-002');

      // Key 'j' to move to next
      stdin.write('j');
      expect(onSelectTask).toHaveBeenCalledWith('TASK-002');
    });
  });

  describe('Atualização Dinâmica e Timers', () => {
    it('ao existir tarefa em execução, exibe spinner animado e atualiza frames', async () => {
      const { lastFrame } = renderWithProviders(
        <TaskList
          tasks={[
            {
              id: 'TASK-001',
              title: 'Running task',
              status: 'running',
              dependencies: [],
              startedAt: new Date().toISOString(),
            },
          ]}
        />
      );

      expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
      let advanced = false;
      for (let i = 0; i < 20; i++) {
        await sleep(25);
        if (lastFrame()?.includes(SPINNER_FRAMES[1])) {
          advanced = true;
          break;
        }
      }
      expect(advanced).toBe(true);
    });

    it('atualiza dinamicamente a duração decorrida de tarefas em execução conforme o timer avança', async () => {
      vi.useFakeTimers();
      try {
        const startTime = new Date(Date.now() - 2000).toISOString();
        const { lastFrame } = renderWithProviders(
          <TaskList
            tasks={[
              {
                id: 'TASK-DONE',
                title: 'Initial setup',
                status: 'completed',
                dependencies: [],
                startedAt: '2026-09-06T10:00:00.000Z',
                completedAt: '2026-09-06T10:00:05.000Z',
              },
              {
                id: 'TASK-LIVE',
                title: 'Long running task',
                status: 'running',
                dependencies: [],
                startedAt: startTime,
              },
              {
                id: 'TASK-PENDING',
                title: 'Pending deploy',
                status: 'pending',
                dependencies: ['TASK-LIVE'],
              },
            ]}
          />
        );

        const initial = lastFrame() ?? '';
        expect(initial).toContain('TASK-DONE');
        expect(initial).toContain('5s');
        expect(initial).toContain('TASK-LIVE');
        expect(initial).toMatch(/[23]s/);
        expect(initial).toContain('TASK-PENDING');

        vi.advanceTimersByTime(1000);
        await vi.runOnlyPendingTimersAsync();

        const afterTick = lastFrame() ?? '';
        expect(afterTick).toContain('TASK-DONE');
        expect(afterTick).toContain('5s');
        expect(afterTick).toContain('TASK-LIVE');
        expect(afterTick).toMatch(/[34]s/);
        expect(afterTick).toContain('TASK-PENDING');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Memoization e Isolamento de Renderização (TaskRow)', () => {
    it('preserva a renderização de tarefas concluídas sem renderizações desnecessárias durante animação do spinner', async () => {
      const tasks: TaskItem[] = [
        {
          id: 'TASK-DONE',
          title: 'Finished work',
          status: 'completed',
          dependencies: [],
          startedAt: '2026-09-06T10:00:00.000Z',
          completedAt: '2026-09-06T10:00:10.000Z',
        },
        {
          id: 'TASK-ACTIVE',
          title: 'In progress work',
          status: 'running',
          dependencies: [],
          startedAt: new Date().toISOString(),
        },
      ];

      const { lastFrame, unmount } = renderWithProviders(
        <TaskList tasks={tasks} selectedTaskId="TASK-DONE" isFocused={true} />
      );

      const initial = lastFrame() ?? '';
      expect(initial).toContain('TASK-DONE');
      expect(initial).toContain('✓');
      expect(initial).toContain('10s');
      expect(initial).toContain('TASK-ACTIVE');
      expect(initial).toContain(SPINNER_FRAMES[0]);

      for (let i = 0; i < 20; i++) {
        await sleep(25);
        if (lastFrame()?.includes(SPINNER_FRAMES[1])) break;
      }

      const afterTick = lastFrame() ?? '';
      expect(afterTick).toContain('TASK-DONE');
      expect(afterTick).toContain('✓');
      expect(afterTick).toContain('10s');
      expect(afterTick).toContain(SPINNER_FRAMES[1]);

      unmount();
    });

    describe('comparador areTaskRowPropsEqual', () => {
      const baseTask: TaskItem = {
        id: 'TASK-001',
        title: 'Setup task',
        status: 'completed',
        dependencies: [],
        startedAt: '2026-09-06T10:00:00.000Z',
        completedAt: '2026-09-06T10:00:05.000Z',
      };

      it('retorna true quando referências e propriedades são idênticas', () => {
        const prev = { task: baseTask, isSelected: false, isFocused: true };
        const next = { task: baseTask, isSelected: false, isFocused: true };
        expect(areTaskRowPropsEqual(prev, next)).toBe(true);
      });

      it('retorna true quando task é clone com campos essenciais iguais', () => {
        const prev = { task: baseTask, isSelected: true, isFocused: true };
        const next = {
          task: { ...baseTask, errors: ['different errors but ignored in row'] },
          isSelected: true,
          isFocused: true,
        };
        expect(areTaskRowPropsEqual(prev, next)).toBe(true);
      });

      it('retorna false quando isSelected muda', () => {
        const prev = { task: baseTask, isSelected: false, isFocused: true };
        const next = { task: baseTask, isSelected: true, isFocused: true };
        expect(areTaskRowPropsEqual(prev, next)).toBe(false);
      });

      it('retorna false quando isFocused muda', () => {
        const prev = { task: baseTask, isSelected: true, isFocused: false };
        const next = { task: baseTask, isSelected: true, isFocused: true };
        expect(areTaskRowPropsEqual(prev, next)).toBe(false);
      });

      it('retorna false quando status da tarefa muda', () => {
        const prev = { task: baseTask, isSelected: false, isFocused: false };
        const next = {
          task: { ...baseTask, status: 'running' as const },
          isSelected: false,
          isFocused: false,
        };
        expect(areTaskRowPropsEqual(prev, next)).toBe(false);
      });

      it('retorna false quando o título da tarefa muda', () => {
        const prev = { task: baseTask, isSelected: false, isFocused: false };
        const next = {
          task: { ...baseTask, title: 'Updated Title' },
          isSelected: false,
          isFocused: false,
        };
        expect(areTaskRowPropsEqual(prev, next)).toBe(false);
      });

      it('retorna false quando startedAt muda', () => {
        const prev = { task: baseTask, isSelected: false, isFocused: false };
        const next = {
          task: { ...baseTask, startedAt: '2026-09-06T10:00:01.000Z' },
          isSelected: false,
          isFocused: false,
        };
        expect(areTaskRowPropsEqual(prev, next)).toBe(false);
      });

      it('retorna false quando completedAt muda', () => {
        const prev = { task: baseTask, isSelected: false, isFocused: false };
        const next = {
          task: { ...baseTask, completedAt: '2026-09-06T10:00:10.000Z' },
          isSelected: false,
          isFocused: false,
        };
        expect(areTaskRowPropsEqual(prev, next)).toBe(false);
      });
    });
  });
});