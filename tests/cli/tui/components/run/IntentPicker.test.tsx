import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntentPicker } from '../../../../../src/cli/tui/components/run/components/IntentPicker.js';
import { createAppContainer } from '../../../../../src/infrastructure/container.js';
import { InMemoryWorkspaceGateway } from '../../../../helpers/in-memory-workspace.js';
import { renderWithProviders, flushAsync } from '../../helpers/renderWithProviders.js';

describe('IntentPicker', () => {
  it('selects an intent without starting its run', async () => {
    const workspace = new InMemoryWorkspaceGateway();
    const container = createAppContainer(workspace);
    const scheduler = container.createTaskScheduler(container.runnerProvider('codex'), {
      environment: 'codex', plannerAgent: 'default', executorAgent: 'default', language: 'en',
    });
    const run = vi.spyOn(scheduler, 'run');
    const { stdin } = renderWithProviders(
      <IntentPicker initialIntents={[{ name: 'example', title: 'Example', status: 'pending', taskCount: 1 }]} />,
      { container, scheduler },
    );

    stdin.write('\r');
    await flushAsync();

    expect(run).not.toHaveBeenCalled();
  });
});
