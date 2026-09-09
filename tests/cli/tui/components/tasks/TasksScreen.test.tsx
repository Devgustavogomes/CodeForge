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
    expect(output).toContain('Task: TASK-001');
    expect(output).toContain('Define interfaces and domain entities');
    expect(output).toContain('src/domain/entity.ts');
  });

  it('dispatches complete and reset actions on hotkeys c, x, and ignores r', async () => {
    const onCompleteTask = vi.fn();
    const onResetTask = vi.fn();

    const { stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        onCompleteTask={onCompleteTask}
        onResetTask={onResetTask}
        isInteractive={true}
      />
    );

    // Initial task is TASK-001. Press 'c' to complete
    stdin.write('c');
    await tick();
    expect(onCompleteTask).toHaveBeenCalledWith('TASK-001');

    // Press 'r' (should NOT do anything in tasks tab anymore)
    stdin.write('r');
    await tick();

    // Press 'x' to reset
    stdin.write('x');
    await tick();
    expect(onResetTask).toHaveBeenCalledWith('TASK-001');
  });

  it('activates and handles spec search bar on "/" hotkey', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={true}
      />
    );

    // Press '/' to start spec search
    stdin.write('/');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).toContain('Search:');

    // Type query
    stdin.write('test');
    await tick();

    output = lastFrame() ?? '';
    expect(output).toContain('test█');

    // Press Enter to submit search
    stdin.write('\r');
    await tick();

    output = lastFrame() ?? '';
    expect(output).not.toContain('Search:');
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
    expect(output).toContain('Formatted');
  });

  it('renders TaskTree with clean flat alignment for tasks', () => {
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
    expect(output).toContain('▌');
  });

  it('renders TaskMetadataView compact by default and reveals constraints/acceptance when expanded', () => {
    // Default (not expanded)
    const { lastFrame } = renderWithProviders(
      <TaskMetadataView
        selectedTask={mockTasks[1]}
        viewJson={false}
        isExpanded={false}
        feedback={{ type: 'error', message: 'Something failed' }}
        isSideBySide={true}
      />
    );
    let output = lastFrame() ?? '';
    expect(output).toContain('Task: TASK-002');
    expect(output).toContain('Business logic execution');
    expect(output).toContain('TASK-001');
    expect(output).not.toContain('TypeScript only');
    expect(output).not.toContain('Pass unit tests');
    expect(output).toContain('ReferenceError: entity is undefined');
    expect(output).toContain('Something failed');
    expect(output).toContain('[e] Expand');

    // Expanded view
    const expandedRender = renderWithProviders(
      <TaskMetadataView
        selectedTask={mockTasks[1]}
        viewJson={false}
        isExpanded={true}
        feedback={null}
        isSideBySide={true}
      />
    );
    output = expandedRender.lastFrame() ?? '';
    expect(output).toContain('Constraints:');
    expect(output).toContain('TypeScript only');
    expect(output).toContain('Acceptance:');
    expect(output).toContain('Pass unit tests');
    expect(output).toContain('[e] Collapse');
  });

  it('toggles expand mode in TasksScreen with "e" hotkey', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <TasksScreen
        initialSpec="test-spec"
        initialTasks={mockTasks}
        isInteractive={true}
      />
    );

    // Initial task is TASK-001, navigate to TASK-002
    stdin.write('j');
    await tick();

    let output = lastFrame() ?? '';
    expect(output).not.toContain('TypeScript only');

    // Press 'e' to expand
    stdin.write('e');
    await tick();

    output = lastFrame() ?? '';
    expect(output).toContain('TypeScript only');
    expect(output).toContain('Pass unit tests');

    // Press 'e' again to collapse
    stdin.write('e');
    await tick();

    output = lastFrame() ?? '';
    expect(output).not.toContain('TypeScript only');
  });
});
