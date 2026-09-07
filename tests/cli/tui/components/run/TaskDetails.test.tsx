import React from 'react';
import { describe, it, expect } from 'vitest';
import { TaskDetails } from '../../../../../src/cli/tui/components/run/TaskDetails.js';
import { TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('TaskDetails component', () => {
  it('renders "No task selected" when task is null', () => {
    const { lastFrame } = renderWithProviders(<TaskDetails task={null} />);
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

    const { lastFrame } = renderWithProviders(<TaskDetails task={task} />);
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

    const { lastFrame } = renderWithProviders(<TaskDetails task={task} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('[FAILED]');
    expect(output).toContain('Error Diagnostic');
    expect(output).toContain('Fatal compile error on line 42');
    expect(output).toContain('Process exited with code 1');
  });

  it('renders full objective text wrapped inside a structured box without truncation', () => {
    const longObjective =
      'Refactor the terminal user interface to support dynamic log wrapping and ensure all task objectives and diagnostic error messages wrap across multiple lines without truncation.';

    const task: TaskItem = {
      id: 'TASK-006',
      title: 'Improve Text Readability',
      status: 'pending',
      dependencies: [],
      objective: longObjective,
    };

    const { lastFrame } = renderWithProviders(<TaskDetails task={task} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Objective:');
    expect(output).toContain('Refactor the terminal user interface');
    expect(output).toContain('without truncation.');
    expect(output).toMatch(/[╭─╮│╰╯]/);
  });

  it('renders error tail section with background styling and wrapped lines without truncation', () => {
    const longError =
      'FatalExecutionError: Exception occurred at module /very/deep/project/path/to/source/file/that/spans/multiple/lines.ts:42 - Connection refused';

    const task: TaskItem = {
      id: 'TASK-003',
      title: 'Failed Task',
      status: 'failed',
      dependencies: [],
      errors: [longError, 'Process exited with code 1'],
    };

    const { lastFrame } = renderWithProviders(<TaskDetails task={task} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('[FAILED]');
    expect(output).toContain('Error Diagnostic');
    expect(output).toContain('FatalExecutionError: Exception occurred at module');
    expect(output).toContain('Connection refused');
    expect(output).toContain('Process exited with code 1');
  });

  it('renders dependencies and file paths with multi-line layout without truncation', () => {
    const task: TaskItem = {
      id: 'TASK-007',
      title: 'Multi-dependency Task',
      status: 'running',
      dependencies: ['TASK-001-setup', 'TASK-002-infra', 'TASK-003-scheduler', 'TASK-004-tui'],
      files: [
        'src/cli/tui/components/run/TaskDetails.tsx',
        'src/cli/tui/components/run/LogStreamView.tsx',
      ],
    };

    const { lastFrame } = renderWithProviders(<TaskDetails task={task} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('TASK-001-setup');
    expect(output).toContain('TASK-002-infra');
    expect(output).toContain('TASK-003-scheduler');
    expect(output).toContain('TASK-004-tui');
    expect(output).toContain('src/cli/tui/components/run/TaskDetails.tsx');
    expect(output).toContain('src/cli/tui/components/run/LogStreamView.tsx');
  });
});
