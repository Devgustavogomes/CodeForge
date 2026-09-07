import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  TasksScreen,
  TaskScreenItem,
} from '../../../../../src/cli/tui/components/tasks/TasksScreen.js';
import { TaskTree } from '../../../../../src/cli/tui/components/tasks/components/TaskTree.js';
import { TaskMetadataView } from '../../../../../src/cli/tui/components/tasks/components/TaskMetadataView.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';

const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TasksScreen component', () => {
  const mockTasks: TaskScreenItem[] = [
    {
      id: 'TASK-001',
      title: 'Setup core entities',
      status: 'completed',
      dependencies: [],
      objective: 'Define interfaces and domain entities',
      files: ['src/domain/entity.ts'],
    },
    {
      id: 'TASK-002',
      title: 'Implement use cases',
      status: 'failed',
      dependencies: ['TASK-001'],
      objective: 'Business logic execution',
      files: ['src/application/use-case.ts'],
      errors: ['ReferenceError: entity is undefined'],
      constraints: ['TypeScript only'],
      acceptanceCriteria: ['Pass unit tests'],
    },
  ];

  it('renders tasks list with status icons and inspects details', () => {
    const { lastFrame } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={false}
      />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Tasks (2)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('[COMPLETED]');
    expect(output).toContain('TASK-002');
    expect(output).toContain('Task Details: TASK-001');
    expect(output).toContain('Define interfaces and domain entities');
    expect(output).toContain('src/domain/entity.ts');
  });

  it('dispatches complete, retry, and reset actions on hotkeys c, r, x', async () => {
    const onCompleteTask = vi.fn();
    const onRetryTask = vi.fn();
    const onResetTask = vi.fn();

    const { stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        onCompleteTask={onCompleteTask}
        onRetryTask={onRetryTask}
        onResetTask={onResetTask}
        isInteractive={true}
      />
    );

    // Initial task is TASK-001. Press 'c' to complete
    stdin.write('c');
    await tick();
    expect(onCompleteTask).toHaveBeenCalledWith('TASK-001');

    // Press 'r' to retry
    stdin.write('r');
    await tick();
    expect(onRetryTask).toHaveBeenCalledWith('TASK-001');

    // Press 'x' to reset
    stdin.write('x');
    await tick();
    expect(onResetTask).toHaveBeenCalledWith('TASK-001');
  });

  it('toggles raw JSON view when "v" is pressed', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={true}
      />
    );

    // Press 'v' to toggle JSON view
    stdin.write('v');
    await tick();

    const output = lastFrame() ?? '';
    expect(output).toContain('"id": "TASK-001"');
    expect(output).toContain('Formatted View');
  });

  it('renders TaskTree with indentation for dependent tasks', () => {
    const { lastFrame } = renderWithProviders(
      <TaskTree
        tasks={mockTasks}
        visibleTasks={mockTasks}
        selectedTaskId="TASK-001"
        specs={['test-spec']}
        selectedSpecIndex={0}
        currentSpec="test-spec"
        isSideBySide={true}
      />
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('Tasks (2)');
    expect(output).toContain('TASK-001');
    expect(output).toContain('TASK-002');
    expect(output).toContain('❯');
  });

  it('renders TaskMetadataView with full metadata attributes', () => {
    const { lastFrame } = renderWithProviders(
      <TaskMetadataView
        selectedTask={mockTasks[1]}
        viewJson={false}
        feedback={{ type: 'error', message: 'Something failed' }}
        isSideBySide={true}
      />
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('Task Details: TASK-002');
    expect(output).toContain('Business logic execution');
    expect(output).toContain('TASK-001');
    expect(output).toContain('TypeScript only');
    expect(output).toContain('Pass unit tests');
    expect(output).toContain('ReferenceError: entity is undefined');
    expect(output).toContain('Something failed');
  });
});
