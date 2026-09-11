import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SpecsScreen, SpecItemWithStats } from '../../../../../src/cli/tui/components/specs/SpecsScreen.js';
import { AppContainer } from '../../../../../src/infrastructure/container.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SpecsScreen - Gerenciamento de Especificações (BDD)', () => {
  const mockSpecs: SpecItemWithStats[] = [
    {
      name: 'auth',
      title: 'Authentication Module',
      status: 'completed',
      taskCount: 5,
      updatedAt: '2026-09-06T12:00:00.000Z',
    },
    {
      name: 'tui',
      title: 'TUI Refactoring',
      status: 'in_progress',
      taskCount: 8,
      updatedAt: '2026-09-06T15:30:00.000Z',
    },
  ];

  describe('Listagem e Exibição de Especificações', () => {
    it('ao carregar especificações, exibe lista com status badges e contagem de tarefas', () => {
      const { lastFrame } = renderWithProviders(
        <SpecsScreen initialSpecs={mockSpecs} isInteractive={false} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Specifications (2)');
      expect(output).toContain('auth');
      expect(output).toContain('[COMPLETED]');
      expect(output).toContain('5 tasks');
      expect(output).toContain('tui');
      expect(output).toContain('[IN PROGRESS]');
      expect(output).toContain('8 tasks');
    });
  });

  describe('Navegação e Seleção de Especificações', () => {
    it('ao pressionar Enter, seleciona a spec atual e dispara o callback onOpenRun', async () => {
      const onOpenRun = vi.fn();
      const { stdin } = renderWithProviders(
        <SpecsScreen
          initialSpecs={mockSpecs}
          onOpenRun={onOpenRun}
          isInteractive={true}
        />
      );

      // Initial selected spec is 'auth'. Press Enter:
      stdin.write('\r');
      await tick();
      expect(onOpenRun).toHaveBeenCalledWith('auth');

      // Press down arrow to select 'tui'
      stdin.write('\u001B[B');
      await tick();
      stdin.write('\r');
      await tick();
      expect(onOpenRun).toHaveBeenCalledWith('tui');
    });

    it('ao utilizar as teclas j/k, navega bidirecionalmente entre as especificações', async () => {
      const onOpenRun = vi.fn();
      const { stdin } = renderWithProviders(
        <SpecsScreen
          initialSpecs={mockSpecs}
          onOpenRun={onOpenRun}
          isInteractive={true}
        />
      );

      // Navigate down with 'j' to select 'tui'
      stdin.write('j');
      await tick();
      stdin.write('\r');
      await tick();
      expect(onOpenRun).toHaveBeenCalledWith('tui');

      // Navigate back up with 'k' to select 'auth'
      stdin.write('k');
      await tick();
      stdin.write('\r');
      await tick();
      expect(onOpenRun).toHaveBeenCalledWith('auth');
    });
  });

  describe('Ciclo de Vida do Plano (Validação e Geração)', () => {
    it('ao pressionar "v", executa a validação de plano para a especificação ativa', async () => {
      const mockValidate = vi.fn().mockReturnValue({
        kind: 'valid',
      });
      const mockContainer = {
        validatePlanUseCase: {
          execute: mockValidate,
        },
        listSpecsUseCase: {
          execute: () => mockSpecs,
        },
        gw: {
          exists: () => false,
          listDir: () => [],
        },
      } as unknown as AppContainer;

      const { lastFrame, stdin } = renderWithProviders(
        <SpecsScreen
          container={mockContainer}
          initialSpecs={mockSpecs}
          isInteractive={true}
        />
      );

      // Press 'v' to validate plan
      stdin.write('v');
      await tick();

      expect(mockValidate).toHaveBeenCalledWith('auth');
      const output = lastFrame() ?? '';
      expect(output).toContain('is valid');
    });

    it('ao pressionar "p", dispara a geração de plano com o modelo configurado', async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        kind: 'valid',
      });
      const mockContainer = {
        generatePlanUseCase: {
          execute: mockGenerate,
        },
        configService: {
          loadConfig: () => ({ plannerAgent: 'test-agent' }),
        },
        listSpecsUseCase: {
          execute: () => mockSpecs,
        },
        gw: {
          exists: () => false,
          listDir: () => [],
        },
      } as unknown as AppContainer;

      const { stdin } = renderWithProviders(
        <SpecsScreen
          container={mockContainer}
          initialSpecs={mockSpecs}
          isInteractive={true}
        />
      );

      // Press 'p' to generate plan
      stdin.write('p');
      await tick();

      expect(mockGenerate).toHaveBeenCalledWith('auth', 'test-agent');
    });

    it('ao pressionar "g", também dispara a geração de plano com o agente', async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        kind: 'valid',
      });
      const mockContainer = {
        generatePlanUseCase: {
          execute: mockGenerate,
        },
        configService: {
          loadConfig: () => ({ plannerAgent: 'test-agent' }),
        },
        listSpecsUseCase: {
          execute: () => mockSpecs,
        },
        gw: {
          exists: () => false,
          listDir: () => [],
        },
      } as unknown as AppContainer;

      const { stdin } = renderWithProviders(
        <SpecsScreen
          container={mockContainer}
          initialSpecs={mockSpecs}
          isInteractive={true}
        />
      );

      // Press 'g' to generate plan
      stdin.write('g');
      await tick();

      expect(mockGenerate).toHaveBeenCalledWith('auth', 'test-agent');
    });

    it('exibe card de progresso em tempo real durante a geração e card de sucesso após conclusão', async () => {
      let resolvePlan!: (value: unknown) => void;
      const planPromise = new Promise((resolve) => {
        resolvePlan = resolve;
      });
      const mockGenerate = vi.fn().mockImplementation(() => planPromise);

      const mockContainer = {
        generatePlanUseCase: {
          execute: mockGenerate,
        },
        configService: {
          loadConfig: () => ({ plannerAgent: 'ai-planner' }),
        },
        listSpecsUseCase: {
          execute: () => mockSpecs,
        },
        gw: {
          exists: () => false,
          listDir: () => [],
        },
      } as unknown as AppContainer;

      const { lastFrame, stdin } = renderWithProviders(
        <SpecsScreen
          container={mockContainer}
          initialSpecs={mockSpecs}
          isInteractive={true}
        />
      );

      // Trigger plan generation via 'p'
      stdin.write('p');
      await tick(30);

      // Progress card should be visible during execution
      let output = lastFrame() ?? '';
      expect(output).toContain('⚡ Gerando Plano de Execução [auth]');
      expect(output).toContain('Planejando com agente de IA...');
      expect(output).toContain('⏱ Decorrido:');

      // Resolve plan generation
      resolvePlan({ kind: 'valid' });
      await tick(30);

      // Completion card should be visible
      output = lastFrame() ?? '';
      expect(output).toContain('✓ Plano Gerado com Sucesso');
      expect(output).toContain('tarefas criadas e validadas');
    });

    it('exibe falhas e mensagens de erro quando a geração de plano retornar inválida', async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        kind: 'invalid',
        errors: ['Circular dependency: task-1 -> task-2 -> task-1'],
      });

      const mockContainer = {
        generatePlanUseCase: {
          execute: mockGenerate,
        },
        configService: {
          loadConfig: () => ({ plannerAgent: 'ai-planner' }),
        },
        listSpecsUseCase: {
          execute: () => mockSpecs,
        },
        gw: {
          exists: () => false,
          listDir: () => [],
        },
      } as unknown as AppContainer;

      const { lastFrame, stdin } = renderWithProviders(
        <SpecsScreen
          container={mockContainer}
          initialSpecs={mockSpecs}
          isInteractive={true}
        />
      );

      stdin.write('p');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('✗ Falha no Planejamento');
      expect(output).toContain('Circular dependency: task-1 -> task-2 -> task-1');
    });
  });

  describe('Criação e Importação de Especificações', () => {
    it('ao pressionar "c", abre CreateSpecModal; ao pressionar "P", abre PullSpecModal', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <SpecsScreen initialSpecs={mockSpecs} isInteractive={true} />
      );

      // Press 'c'
      stdin.write('c');
      await tick();
      let output = lastFrame() ?? '';
      expect(output).toContain('Create Specification');

      // Close with Esc
      stdin.write('\u001B');
      await tick();

      // Press 'P'
      stdin.write('P');
      await tick();
      output = lastFrame() ?? '';
      expect(output).toContain('Pull Specification');
    });
  });
});