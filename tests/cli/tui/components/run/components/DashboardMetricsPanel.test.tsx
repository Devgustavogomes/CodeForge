import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { DashboardMetricsPanel } from '../../../../../../src/cli/tui/components/run/components/DashboardMetricsPanel.js';

describe('DashboardMetricsPanel review lifecycle', () => {
  it('renders the active review banner and elapsed timer', () => {
    const { lastFrame } = render(
      <DashboardMetricsPanel
        intentName="reviewed-intent"
        tasks={[{ id: 'TASK-001', title: 'Done', status: 'completed', dependencies: [] }]}
        schedulerStatus="reviewing"
        reviewStartedAt={new Date(Date.now() - 1000).toISOString()}
      />,
    );
    expect(lastFrame()).toContain('AI Review in progress');
    expect(lastFrame()).toContain('Elapsed:');
  });

  it('shows generated task instructions and recoverable review errors', () => {
    const { lastFrame, rerender } = render(
      <DashboardMetricsPanel
        tasks={[{ id: 'TASK-002', title: 'Fix review finding', status: 'pending', dependencies: [] }]}
        schedulerStatus="paused"
        reviewResult={{ outcome: 'tasks_created', newTasksCount: 1, taskIds: ['TASK-002'] }}
      />,
    );
    expect(lastFrame()).toContain('AI Review created 1 new task. Press [Enter] to run.');

    rerender(
      <DashboardMetricsPanel
        tasks={[{ id: 'TASK-001', title: 'Done', status: 'completed', dependencies: [] }]}
        schedulerStatus="paused"
        reviewError="review timed out"
      />,
    );
    expect(lastFrame()).toContain('AI Review failed: review timed out. Press [v] to retry.');
  });

  it('keeps agent error output out of the metrics area', () => {
    const longOutput = 'agent output '.repeat(500);
    const { lastFrame } = render(
      <DashboardMetricsPanel tasks={[]} schedulerStatus="paused" reviewError={`Review failed\n${longOutput}`} />,
    );
    expect(lastFrame()).toContain('AI Review failed: Review failed');
    expect(lastFrame()).not.toContain(longOutput);
  });
});
