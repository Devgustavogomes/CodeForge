import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SpecSourceStep } from '../../../../../src/cli/tui/components/onboarding/steps/SpecSourceStep.js';
import { flushAsync, renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('SpecSourceStep', () => {
  it('selects Local by default and advances on confirmation', async () => {
    const onChange = vi.fn();
    const onNext = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <SpecSourceStep
        specSource={{ provider: 'local' }}
        onChange={onChange}
        onNext={onNext}
      />,
    );

    stdin.write('\r');
    await flushAsync();

    expect(onChange).toHaveBeenCalledWith({ provider: 'filesystem' });
    expect(onNext).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('configures a remote source inline and preserves literal environment reference', async () => {
    const onChange = vi.fn();
    const onNext = vi.fn();
    const onFormActiveChange = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <SpecSourceStep
        specSource={{ provider: 'local' }}
        onChange={onChange}
        onNext={onNext}
        onFormActiveChange={onFormActiveChange}
      />,
    );

    stdin.write('2');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();


    stdin.write('acme/codeforge');
    await flushAsync();
    stdin.write('\t');
    await flushAsync();
    stdin.write('platform');
    await flushAsync();
    stdin.write('\t');
    await flushAsync();
    stdin.write('\u0015');
    await flushAsync();
    stdin.write('$CUSTOM_GITHUB_TOKEN');
    await flushAsync();
    stdin.write('\t');
    await flushAsync();
    stdin.write('\r');
    await flushAsync();

    expect(onChange).toHaveBeenCalledWith({
      provider: 'github',
      project: 'acme/codeforge',
      team: 'platform',
      apiKey: '$CUSTOM_GITHUB_TOKEN',
    });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onFormActiveChange).toHaveBeenCalledWith(true);
    unmount();
  });
});
