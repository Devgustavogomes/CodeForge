import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import {
  useTextInput,
  UseTextInputOptions,
  UseTextInputReturn,
} from '../../../../src/cli/tui/hooks/useTextInput.js';
import {
  NavigationProvider,
  useNavigation,
} from '../../../../src/cli/tui/context/NavigationContext.js';

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
  it('gerencia valor inicial e permite digitação sequencial de texto', async () => {
    const onChange = vi.fn();
    const { lastFrame, stdin } = render(
      <TestInputApp initialValue="" onChange={onChange} />
    );

    expect(lastFrame()).toContain('Value:');

    stdin.write('h');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Value:h');
    expect(onChange).toHaveBeenLastCalledWith('h');

    stdin.write('i');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Value:hi');
    expect(onChange).toHaveBeenLastCalledWith('hi');
  });

  it('remove último caractere ao receber backspace ou delete', async () => {
    const onChange = vi.fn();
    const { lastFrame, stdin } = render(
      <TestInputApp initialValue="code" onChange={onChange} />
    );

    expect(lastFrame()).toContain('Value:code');

    // Backspace (\x7f)
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Value:cod');
    expect(onChange).toHaveBeenLastCalledWith('cod');

    // Delete / Backspace alternativo (\x08)
    stdin.write('\x08');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Value:co');
    expect(onChange).toHaveBeenLastCalledWith('co');
  });

  it('limpa todo o texto ao receber Ctrl+U', async () => {
    const onChange = vi.fn();
    const { lastFrame, stdin } = render(
      <TestInputApp initialValue="hello-world" onChange={onChange} />
    );

    expect(lastFrame()).toContain('Value:hello-world');

    // Ctrl+U (\x15)
    stdin.write('\x15');
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('Value:');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('chama onSubmit com o valor atual ao pressionar Enter', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <TestInputApp initialValue="spec-login" onSubmit={onSubmit} />
    );

    // Enter (\r)
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 20));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('spec-login');
  });

  it('chama onCancel ao pressionar Escape', async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <TestInputApp onCancel={onCancel} />
    );

    // Escape (\u001B)
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ignora digitação e atalhos quando isActive é falso', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame, stdin } = render(
      <TestInputApp
        initialValue="locked"
        isActive={false}
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    stdin.write('x');
    stdin.write('\x7f');
    stdin.write('\r');
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('Value:locked');
    expect(onChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('sincroniza com NavigationContext.setTextInputActive quando syncNavigation é verdadeiro', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const NavObserver = () => {
      capturedNav = useNavigation();
      return <Text>NavActive:{String(capturedNav.isTextInputActive)}</Text>;
    };

    const CombinedApp: React.FC<{ showInput?: boolean; isActive: boolean }> = ({
      showInput = true,
      isActive,
    }) => (
      <NavigationProvider>
        <NavObserver />
        {showInput && <TestInputApp isActive={isActive} syncNavigation={true} />}
      </NavigationProvider>
    );

    const { lastFrame, rerender } = render(<CombinedApp isActive={true} />);
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('NavActive:true');
    expect(capturedNav.isTextInputActive).toBe(true);

    // Alternar para isActive = false
    rerender(<CombinedApp isActive={false} />);
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('NavActive:false');
    expect(capturedNav.isTextInputActive).toBe(false);

    // Reativar
    rerender(<CombinedApp isActive={true} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(capturedNav.isTextInputActive).toBe(true);

    // Desmontar o hook deve disparar o cleanup e redefinir textInputActive para false
    rerender(<CombinedApp showInput={false} isActive={true} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('NavActive:false');
    expect(capturedNav.isTextInputActive).toBe(false);
  });

  it('permite redefinir e limpar o valor através dos métodos retornados', async () => {
    const onChange = vi.fn();
    let hookReturn!: UseTextInputReturn;

    const { lastFrame } = render(
      <TestInputApp
        initialValue="start"
        onChange={onChange}
        onRender={(ret) => {
          hookReturn = ret;
        }}
      />
    );

    expect(lastFrame()).toContain('Value:start');

    hookReturn.setValue('updated');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Value:updated');
    expect(onChange).toHaveBeenCalledWith('updated');

    hookReturn.clear();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Value:');
    expect(onChange).toHaveBeenCalledWith('');
  });
});
