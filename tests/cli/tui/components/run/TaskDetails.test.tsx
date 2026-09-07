import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { TaskDetails } from '../../../../../src/cli/tui/components/run/TaskDetails.js';
import { TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';

describe('TaskDetails component', () => {
  it('renders "No task selected" when task is null', () => {
    const { lastFrame } = render(<TaskDetails task={null} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Task Details');
    expect(output).toContain('No task selected.');
  });

  it('renders selected task metadata, objective, files, and dependencies', () => {
    const task: TaskItem = {
      id: 'TASK-005',
      title: 'RunDashboard Implementation',
      status: 'running',
      dependencies: ['TASK-001', 'TASK-002'],
      objective: 'Build responsive RunDashboard with TaskList and LogStreamView',
      files: ['src/cli/tui/RunDashboard.tsx', 'src/cli/tui/TaskList.tsx'],
      startedAt: '2026-09-06T10:00:00.000Z',
    };

    const { lastFrame } = render(<TaskDetails task={task} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('TASK-005');
    expect(output).toContain('RunDashboard Implementation');
    expect(output).toContain('[RUNNING]');
    expect(output).toContain('Build responsive RunDashboard with TaskList and LogStreamView');
    expect(output).toContain('TASK-001, TASK-002');
    expect(output).toContain('src/cli/tui/RunDashboard.tsx');
    expect(output).toContain('src/cli/tui/TaskList.tsx');
  });

  it('renders error tail section when task has errors', () => {
    const task: TaskItem = {
      id: 'TASK-003',
      title: 'Failed Task',
      status: 'failed',
      dependencies: [],
      errors: ['Fatal compile error on line 42', 'Process exited with code 1'],
    };

    const { lastFrame } = render(<TaskDetails task={task} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('[FAILED]');
    expect(output).toContain('Error Diagnostic');
    expect(output).toContain('Fatal compile error on line 42');
    expect(output).toContain('Process exited with code 1');
  });
});
