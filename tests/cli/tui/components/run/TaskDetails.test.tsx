import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import {
  TaskDetails,
  formatErrorSummary,
} from '../../../../../src/cli/tui/components/run/TaskDetails.js';
import { TaskItem } from '../../../../../src/cli/tui/context/ExecutionContext.js';

describe('TaskDetails', () => {
  it('collapses multiline task errors into a single-line summary in the run dashboard', () => {
    const task: TaskItem = {
      id: 'TASK-001',
      title: 'Failing task',
      status: 'failed',
      dependencies: [],
      errors: ['Command failed\nError: compilation failed\n    at build (src/build.ts:10:2)'],
    };

    const { lastFrame } = render(
      <TaskDetails task={task} compact />,
      { columns: 120 },
    );

    const frame = lastFrame();
    expect(frame).toContain(
      'Command failed Error: compilation failed at build (src/build.ts:10:2)',
    );
    expect(frame).toContain('Error (see logs):');
    expect(frame).not.toContain('\nError: compilation failed');
  });

  it('normalizes blank and heavily spaced diagnostics', () => {
    expect(formatErrorSummary('  failed\r\n\twith   details  ')).toBe(
      'failed with details',
    );
    expect(formatErrorSummary(' \n\t ')).toBe('Unknown error');
  });
});
