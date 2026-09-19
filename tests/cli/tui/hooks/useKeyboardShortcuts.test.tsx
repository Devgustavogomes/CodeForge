import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { NavigationProvider, useNavigation } from '../../../../src/cli/tui/context/NavigationContext.js';
import {
  useKeyboardShortcuts,
  UseKeyboardShortcutsOptions,
} from '../../../../src/cli/tui/hooks/useKeyboardShortcuts.js';
import { flushAsync } from '../helpers/flushAsync.js';

interface TestAppProps {
  shortcutsOptions?: UseKeyboardShortcutsOptions;
  initialTab?: 'run' | 'intents' | 'tasks' | 'docs' | 'config';
}

const TestApp: React.FC<TestAppProps> = ({ shortcutsOptions, initialTab = 'intents' }) => {
  return (
    <NavigationProvider initialTab={initialTab}>
      <TestAppInner shortcutsOptions={shortcutsOptions} />
    </NavigationProvider>
  );
};

const TestAppInner: React.FC<{ shortcutsOptions?: UseKeyboardShortcutsOptions }> = ({
  shortcutsOptions,
}) => {
  useKeyboardShortcuts(shortcutsOptions);
  const nav = useNavigation();

  return (
    <Text>
      Tab:{nav.activeTab} | Modal:{nav.modal?.type ?? 'none'} | TextActive:{String(
        nav.isTextInputActive
      )}
    </Text>
  );
};

describe('useKeyboardShortcuts', () => {
  it('1. registra e dispara callback/navegação quando atalho mapeado é acionado', async () => {
    const onQuit = vi.fn();
    const { lastFrame, stdin } = render(
      <TestApp shortcutsOptions={{ onQuit }} initialTab="run" />
    );
    expect(lastFrame()).toContain('Tab:run');

    // Troca de aba via tecla numérica
    stdin.write('2');
    await flushAsync();
    expect(lastFrame()).toContain('Tab:intents');

    // Atalho de quit via tecla 'q'
    stdin.write('q');
    await flushAsync();
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it('2. ignora teclas não registradas', async () => {
    const { lastFrame, stdin } = render(<TestApp initialTab="run" />);
    expect(lastFrame()).toContain('Tab:run');

    stdin.write('x');
    await flushAsync();
    expect(lastFrame()).toContain('Tab:run');

    stdin.write(':');
    await flushAsync();
    expect(lastFrame()).toContain('Tab:run');
  });

  it('3. respeita a flag de desativação (isActive: false / enabled: false)', async () => {
    const onQuit = vi.fn();
    const { lastFrame, stdin } = render(
      <TestApp shortcutsOptions={{ isActive: false, onQuit }} initialTab="run" />
    );
    expect(lastFrame()).toContain('Tab:run');

    stdin.write('2');
    stdin.write('q');
    await flushAsync();

    expect(lastFrame()).toContain('Tab:run');
    expect(onQuit).not.toHaveBeenCalled();
  });
});
