import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SummaryStep } from '../../../../../src/cli/tui/components/onboarding/steps/SummaryStep.js';
import {
  createMockContainer,
  flushAsync,
  renderWithProviders,
} from '../../helpers/renderWithProviders.js';

describe('SummaryStep', () => {

  it('saves configuration with default language "en" upon pressing Enter to forge', async () => {
    const container = createMockContainer();
    const onComplete = vi.fn();

    const { stdin, unmount } = renderWithProviders(
      <SummaryStep
        container={container}
        environment="local"
        plannerAgent="default"
        executorAgent="default"
        specSource={{ provider: 'local' }}
        hooks={{}}
        onComplete={onComplete}
        celebrationDurationMs={50}
      />,
      { container },
    );

    // Press Enter to trigger workspace forging
    stdin.write('\r');
    await flushAsync(100);

    // Verify config is saved with language 'en'
    const savedConfig = container.configService.loadConfig();
    expect(savedConfig).toBeDefined();
    expect(savedConfig?.language).toBe('en');
    expect(savedConfig?.environment).toBe('local');
    expect(savedConfig?.plannerAgent).toBe('default');
    expect(savedConfig?.executorAgent).toBe('default');
    expect(savedConfig?.specSource?.provider).toBe('filesystem');

    // Wait for celebration and completion callback
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    unmount();
  });
});

