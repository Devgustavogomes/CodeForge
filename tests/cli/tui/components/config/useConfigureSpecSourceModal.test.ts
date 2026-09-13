import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useConfigureSpecSourceModal,
  UseConfigureSpecSourceModalOptions,
  UseConfigureSpecSourceModalReturn,
} from '../../../../../src/cli/tui/components/config/hooks/useConfigureSpecSourceModal.js';
import { flushAsync } from '../../helpers/flushAsync.js';

interface HarnessProps {
  options: UseConfigureSpecSourceModalOptions;
  onUpdate: (ret: UseConfigureSpecSourceModalReturn) => void;
}

const HookHarness: React.FC<HarnessProps> = ({ options, onUpdate }) => {
  const ret = useConfigureSpecSourceModal(options);
  onUpdate(ret);
  return React.createElement(Text, null, `${ret.provider}:${ret.apiKey}`);
};

function renderSpecSourceHook(options: UseConfigureSpecSourceModalOptions) {
  let latest!: UseConfigureSpecSourceModalReturn;
  const result = render(
    React.createElement(HookHarness, {
      options,
      onUpdate: (val) => {
        latest = val;
      },
    }),
  );
  return {
    get current() {
      return latest;
    },
    ...result,
  };
}

describe('useConfigureSpecSourceModal - Provider cycling and API Key handling', () => {
  it('dynamically updates apiKey to provider default env var when cycling providers without custom apiKey', async () => {
    const hook = renderSpecSourceHook({
      config: {
        specSource: { provider: 'filesystem' },
      } as any,
    });

    expect(hook.current.provider).toBe('filesystem');
    expect(hook.current.apiKey).toBe('');

    // Cycle to linear
    hook.current.cycleProvider(1);
    await flushAsync(10);
    expect(hook.current.provider).toBe('linear');
    expect(hook.current.apiKey).toBe('$LINEAR_API_KEY');

    // Cycle to github
    hook.current.cycleProvider(1);
    await flushAsync(10);
    expect(hook.current.provider).toBe('github');
    expect(hook.current.apiKey).toBe('$GITHUB_TOKEN');

    // Cycle to clickup
    hook.current.cycleProvider(1);
    await flushAsync(10);
    expect(hook.current.provider).toBe('clickup');
    expect(hook.current.apiKey).toBe('$CLICKUP_API_KEY');

    hook.unmount();
  });

  it('updates apiKey when cycling away from an existing default apiKey (e.g. clickup to github)', async () => {
    const hook = renderSpecSourceHook({
      config: {
        specSource: { provider: 'clickup', apiKey: '$CLICKUP_API_KEY' },
      } as any,
    });

    expect(hook.current.provider).toBe('clickup');
    expect(hook.current.apiKey).toBe('$CLICKUP_API_KEY');

    // Cycle to filesystem
    hook.current.cycleProvider(1);
    await flushAsync(10);
    expect(hook.current.provider).toBe('filesystem');
    expect(hook.current.apiKey).toBe('');

    // Cycle to linear
    hook.current.cycleProvider(1);
    await flushAsync(10);
    expect(hook.current.provider).toBe('linear');
    expect(hook.current.apiKey).toBe('$LINEAR_API_KEY');

    hook.unmount();
  });

  it('preserves user custom apiKey when cycling providers', async () => {
    const hook = renderSpecSourceHook({
      config: {
        specSource: { provider: 'github' },
      } as any,
    });

    // User types custom secret
    hook.current.setApiKey('ghp_custom_secret_12345');
    await flushAsync(10);
    expect(hook.current.apiKey).toBe('ghp_custom_secret_12345');

    // Cycle provider to clickup
    hook.current.cycleProvider(1);
    await flushAsync(10);
    expect(hook.current.provider).toBe('clickup');
    // Custom apiKey must be preserved
    expect(hook.current.apiKey).toBe('ghp_custom_secret_12345');

    hook.unmount();
  });

  it('saves chosen provider default apiKey when apiKey is left blank', async () => {
    const onUpdateSpecSource = vi.fn();
    const hook = renderSpecSourceHook({
      config: {
        specSource: { provider: 'filesystem' },
      } as any,
      onUpdateSpecSource,
    });

    hook.current.cycleProvider(1); // linear
    await flushAsync(10);
    hook.current.setApiKey(''); // clear apiKey
    await flushAsync(10);

    hook.current.saveSpecSource();
    await flushAsync(10);

    expect(onUpdateSpecSource).toHaveBeenCalledWith({
      provider: 'linear',
      apiKey: '$LINEAR_API_KEY',
    });

    hook.unmount();
  });
});
