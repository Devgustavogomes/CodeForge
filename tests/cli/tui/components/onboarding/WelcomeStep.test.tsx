import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeStep } from '../../../../../src/cli/tui/components/onboarding/steps/WelcomeStep.js';
import { flushAsync, renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('WelcomeStep - Keyboard Navigation', () => {

  it('handles Enter key to trigger onStart when active', async () => {
    const onStart = vi.fn();
    const onExit = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <WelcomeStep onStart={onStart} onExit={onExit} isActive={true} />,
    );

    stdin.write('\r');
    await flushAsync();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    unmount();
  });

  it('handles "q" or Escape key to trigger onExit when active', async () => {
    const onStart = vi.fn();
    const onExit = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <WelcomeStep onStart={onStart} onExit={onExit} isActive={true} />,
    );

    stdin.write('q');
    await flushAsync();

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();

    unmount();
  });
});
