import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import {
  useTextInput,
  UseTextInputOptions,
  UseTextInputReturn,
} from '../../../../src/cli/tui/hooks/useTextInput.js';
import { flushAsync } from '../helpers/flushAsync.js';

interface TestInputAppProps extends UseTextInputOptions {
  onRender?: (ret: UseTextInputReturn) => void;
}

const TestInputApp: React.FC<TestInputAppProps> = ({ onRender, ...options }) => {
  const result = useTextInput(options);
  onRender?.(result);

  return (
    <Box flexDirection="column">
      <Text>Value:{result.value}</Text>
    </Box>
  );
};

describe('useTextInput hook', () => {
  it('1. insere caracteres em bloco e atualiza o valor', async () => {
    const onChange = vi.fn();
    const { lastFrame, stdin } = render(
      <TestInputApp initialValue="" onChange={onChange} />
    );

    expect(lastFrame()).toContain('Value:');

    stdin.write('codeforge');
    await flushAsync();

    expect(lastFrame()).toContain('Value:codeforge');
    expect(onChange).toHaveBeenLastCalledWith('codeforge');
  });

  it('2. remove caractere ao receber backspace', async () => {
    const onChange = vi.fn();
    const { lastFrame, stdin } = render(
      <TestInputApp initialValue="code" onChange={onChange} />
    );

    expect(lastFrame()).toContain('Value:code');

    stdin.write('\x7f');
    await flushAsync();

    expect(lastFrame()).toContain('Value:cod');
    expect(onChange).toHaveBeenLastCalledWith('cod');
  });

  it('3. submete o texto atual ao pressionar Enter', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <TestInputApp initialValue="spec-login" onSubmit={onSubmit} />
    );

    stdin.write('\r');
    await flushAsync();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('spec-login');
  });
});
