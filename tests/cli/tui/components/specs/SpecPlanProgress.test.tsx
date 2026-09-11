import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { SpecPlanProgress } from '../../../../../src/cli/tui/components/specs/components/SpecPlanProgress.js';

describe('SpecPlanProgress component', () => {
  it('renders nothing when not generating and no result', () => {
    const { lastFrame } = render(
      <SpecPlanProgress isGenerating={false} result={null} />
    );
    expect(lastFrame()).toBe('');
  });

  it('renders planning card with animated spinner and live timer during generation', () => {
    const startTime = Date.now() - 5000;
    const { lastFrame } = render(
      <SpecPlanProgress
        specName="auth-spec"
        isGenerating={true}
        startTime={startTime}
      />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('⚡ Gerando Plano de Execução [auth-spec]');
    expect(output).toContain('Planejando com agente de IA...');
    expect(output).toContain('⏱ Decorrido:');
  });

  it('renders completion card with elapsed time and task count on success', () => {
    const startTime = '2026-09-06T10:00:00.000Z';
    const endTime = '2026-09-06T10:00:18.000Z';
    const { lastFrame } = render(
      <SpecPlanProgress
        specName="auth-spec"
        isGenerating={false}
        startTime={startTime}
        endTime={endTime}
        result={{
          kind: 'valid',
          taskCount: 12,
        }}
      />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('✓ Plano Gerado com Sucesso');
    expect(output).toContain('Concluído em 18s • 12 tarefas criadas e validadas');
  });

  it('renders failure card with validation errors when planning fails', () => {
    const { lastFrame } = render(
      <SpecPlanProgress
        specName="auth-spec"
        isGenerating={false}
        result={{
          kind: 'invalid',
          errors: [
            'Circular dependency detected between task-001 and task-002',
            'Missing required field description in task-003',
          ],
        }}
      />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('✗ Falha no Planejamento');
    expect(output).toContain('Erros (2):');
    expect(output).toContain('• Circular dependency detected between task-001 and task-002');
    expect(output).toContain('• Missing required field description in task-003');
  });

  it('renders custom failure message for unexpected errors', () => {
    const { lastFrame } = render(
      <SpecPlanProgress
        specName="auth-spec"
        isGenerating={false}
        result={{
          kind: 'error',
          message: 'Network timeout connecting to planner model',
        }}
      />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('✗ Falha no Planejamento');
    expect(output).toContain('Network timeout connecting to planner model');
  });
});
