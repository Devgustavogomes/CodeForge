import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { RunActionBar } from '../../../../../src/cli/tui/components/run/components/RunActionBar.js';
import { RunLayoutCompact } from '../../../../../src/cli/tui/components/run/components/RunLayoutCompact.js';
import { RunLayoutWide } from '../../../../../src/cli/tui/components/run/components/RunLayoutWide.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const renderActionBar = (props: Partial<React.ComponentProps<typeof RunActionBar>> = {}) =>
  render(
    <RunActionBar
      focusedPanel="tasks"
      selectedTaskStatus={null}
      effectiveStatus="idle"
      hasFailedTasks={false}
      hasPendingTasks={false}
      {...props}
    />,
  ).lastFrame() ?? '';

describe('RunActionBar', () => {
  it('exibe as ações permanentes de tasks e iniciar quando há pendências', () => {
    const output = renderActionBar({ hasPendingTasks: true });

    expect(output).toContain('[Tab] Logs');
    expect(output).toContain('[s] Switch Spec');
    expect(output).toContain('[f] Filter');
    expect(output).toContain('[Enter] Start Run');
    expect(output).toContain('[X] Reset All & Run');
  });

  it('não oferece iniciar enquanto o scheduler está em execução', () => {
    const output = renderActionBar({ effectiveStatus: 'running', hasPendingTasks: true });

    expect(output).not.toContain('[Enter] Start Run');
  });

  it('exibe retry contextual para uma task falhada', () => {
    const output = renderActionBar({ selectedTaskStatus: 'failed', hasFailedTasks: true });

    expect(output).toContain('[r] Retry');
    expect(output).toContain('[R] Retry All Failed');
    expect(output).not.toContain('[x] Reset');
  });

  it('não anuncia retry global quando não há falhas disponíveis', () => {
    const output = renderActionBar({ selectedTaskStatus: 'failed', hasFailedTasks: false });

    expect(output).toContain('[r] Retry');
    expect(output).not.toContain('[R] Retry All Failed');
  });

  it.each(['pending', 'completed'])('exibe reset e complete para task %s', (status) => {
    const output = renderActionBar({ selectedTaskStatus: status });

    expect(output).toContain('[x] Reset');
    expect(output).toContain('[c] Complete');
    expect(output).not.toContain('[r] Retry');
  });

  it('não exibe ações específicas para task em execução', () => {
    const output = renderActionBar({ selectedTaskStatus: 'running' });

    expect(output).not.toContain('[r] Retry');
    expect(output).not.toContain('[x] Reset');
    expect(output).not.toContain('[c] Complete');
  });

  it('exibe apenas as orientações de logs quando o foco está nos logs', () => {
    const output = renderActionBar({ focusedPanel: 'logs', selectedTaskStatus: 'failed', hasPendingTasks: true });

    expect(output).toContain('[Esc] Back to Tasks');
    expect(output).toContain('[↑/↓] Scroll');
    expect(output).toContain('[w] Wrap');
    expect(output).toContain('[g] Top');
    expect(output).toContain('[G] Bottom');
    expect(output).not.toContain('[Tab] Logs');
    expect(output).not.toContain('[r] Retry');
  });

  it('exibe o feedback de forma separada e não deixa conteúdo residual sem ele', () => {
    const withFeedback = renderActionBar({
      actionFeedback: { type: 'success', message: 'Task TASK-001 reset to pending' },
    });
    const withoutFeedback = renderActionBar();

    expect(withFeedback).toContain('› Task TASK-001 reset to pending');
    expect(withoutFeedback).not.toContain('›');
  });

  it('aceita o feedback textual retornado pelo dashboard', () => {
    const output = renderActionBar({ actionFeedback: 'Task TASK-001 reset to pending' });

    expect(output).toContain('› Task TASK-001 reset to pending');
  });
});

describe('slots de actionBar dos layouts Run', () => {
  const layoutProps = {
    tasks: [],
    selectedTaskId: null,
    selectedTask: null,
    focusedPanel: 'tasks' as const,
    terminalRows: 24,
    topMetricsPanel: <React.Fragment />,
    actionBar: <Text>MARCADOR-DA-BARRA</Text>,
  };

  it('renderiza o slot abaixo dos painéis no layout wide', () => {
    const output = renderWithProviders(<RunLayoutWide {...layoutProps} />).lastFrame() ?? '';
    expect(output).toContain('MARCADOR-DA-BARRA');
    expect(output.indexOf('MARCADOR-DA-BARRA')).toBeGreaterThan(output.indexOf('Tasks (0)'));
  });

  it('renderiza o slot abaixo dos painéis no layout compact', () => {
    const output = renderWithProviders(<RunLayoutCompact {...layoutProps} />).lastFrame() ?? '';
    expect(output).toContain('MARCADOR-DA-BARRA');
    expect(output.indexOf('MARCADOR-DA-BARRA')).toBeGreaterThan(output.indexOf('[Tasks]'));
  });
});
