import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SpecSourceStep } from '../../../../../src/cli/tui/components/onboarding/steps/SpecSourceStep.js';
import { flushAsync, renderWithProviders } from '../../helpers/renderWithProviders.js';

describe('SpecSourceStep', () => {
  it('seleciona Local por padrão e avança com uma confirmação', async () => {
    const onChange = vi.fn();
    const onNext = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <SpecSourceStep
        specSource={{ provider: 'local' }}
        onChange={onChange}
        onNext={onNext}
      />,
    );

    expect(lastFrame() ?? '').toContain('Filesystem — .codeforge/specs/');
    expect(lastFrame() ?? '').toContain('RECOMENDADO');

    stdin.write('\r');
    await flushAsync();

    expect(onChange).toHaveBeenCalledWith({ provider: 'filesystem' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('configura uma fonte remota inline e preserva a referência de ambiente literal', async () => {
    const onChange = vi.fn();
    const onNext = vi.fn();
    const onFormActiveChange = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
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

    expect(lastFrame() ?? '').toContain('GitHub — configure a conexão');
    expect(lastFrame() ?? '').toContain('Projeto / Repo (project)');
    expect(lastFrame() ?? '').toContain('Time / Workspace (team)');
    expect(lastFrame() ?? '').toContain('Chave de API (apiKey)');

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
  });
});
