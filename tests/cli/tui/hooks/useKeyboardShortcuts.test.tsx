import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { NavigationProvider, useNavigation } from '../../../../src/cli/tui/context/NavigationContext.js';
import {
  useKeyboardShortcuts,
  UseKeyboardShortcutsOptions,
} from '../../../../src/cli/tui/hooks/useKeyboardShortcuts.js';

interface TestAppProps {
  shortcutsOptions?: UseKeyboardShortcutsOptions;
  initialTab?: 'run' | 'specs' | 'tasks' | 'docs' | 'config';
}

const TestApp: React.FC<TestAppProps> = ({ shortcutsOptions, initialTab = 'specs' }) => {
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
      Tab:{nav.activeTab} | Modal:{nav.modal?.type ?? 'none'} | Palette:{String(
        nav.isCommandPaletteOpen
      )} | TextActive:{String(nav.isTextInputActive)}
    </Text>
  );
};

describe('useKeyboardShortcuts', () => {
  it('switches tabs when numeric keys 1-5 are pressed', async () => {
    const { lastFrame, stdin } = render(<TestApp />);
    expect(lastFrame()).toContain('Tab:specs');

    stdin.write('2');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:tasks');

    stdin.write('3');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:run');

    stdin.write('4');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:docs');

    stdin.write('5');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:config');

    stdin.write('1');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:specs');
  });

  it('navigates tabs with left and right arrow keys', async () => {
    const { lastFrame, stdin } = render(<TestApp initialTab="specs" />);
    expect(lastFrame()).toContain('Tab:specs');

    // Right arrow (\u001B[C)
    stdin.write('\u001B[C');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:tasks');

    // Left arrow (\u001B[D)
    stdin.write('\u001B[D');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:specs');
  });

  it('toggles command palette on Ctrl+K and ":"', async () => {
    const { lastFrame, stdin } = render(<TestApp />);
    expect(lastFrame()).toContain('Palette:false');

    // Press ':'
    stdin.write(':');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette:true');

    // Press Escape (\u001B) to close
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette:false');

    // Press Ctrl+K (\x0B)
    stdin.write('\x0B');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette:true');
  });

  it('invokes onQuit when "q" or Ctrl+C is pressed', async () => {
    const onQuit = vi.fn();
    const { stdin } = render(<TestApp shortcutsOptions={{ onQuit }} />);

    stdin.write('q');
    await new Promise((r) => setTimeout(r, 20));
    expect(onQuit).toHaveBeenCalledTimes(1);

    // Ctrl+C (\x03)
    stdin.write('\x03');
    await new Promise((r) => setTimeout(r, 20));
    expect(onQuit).toHaveBeenCalledTimes(2);
  });

  it('opens quit_confirm modal when onQuit is not provided and "q" is pressed', async () => {
    const { lastFrame, stdin } = render(<TestApp />);
    expect(lastFrame()).toContain('Modal:none');

    stdin.write('q');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Modal:quit_confirm');

    // Press Escape to close modal
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Modal:none');
  });

  it('suppresses tab switching and shortcuts when a modal is open', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const ControllerApp: React.FC = () => {
      return (
        <NavigationProvider initialTab="run">
          <ControllerAppInner />
        </NavigationProvider>
      );
    };

    const ControllerAppInner: React.FC = () => {
      useKeyboardShortcuts();
      capturedNav = useNavigation();
      return (
        <Text>
          Tab:{capturedNav.activeTab} | Modal:{capturedNav.modal?.type ?? 'none'}
        </Text>
      );
    };

    const { lastFrame, stdin } = render(<ControllerApp />);
    expect(lastFrame()).toContain('Tab:run');

    // Open a modal programmatically
    capturedNav.openModal('my_modal');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Modal:my_modal');

    // Pressing '2' should NOT switch tabs while modal is open
    stdin.write('2');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:run');

    // Press Escape to close modal
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Modal:none');

    // Now pressing '2' should switch tabs
    stdin.write('2');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:tasks');
  });

  it('suppresses shortcuts when text input is active', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const ControllerApp: React.FC = () => {
      return (
        <NavigationProvider initialTab="run">
          <ControllerAppInner />
        </NavigationProvider>
      );
    };

    const ControllerAppInner: React.FC = () => {
      useKeyboardShortcuts();
      capturedNav = useNavigation();
      return (
        <Text>
          Tab:{capturedNav.activeTab} | TextActive:{String(capturedNav.isTextInputActive)}
        </Text>
      );
    };

    const { lastFrame, stdin } = render(<ControllerApp />);
    expect(lastFrame()).toContain('Tab:run');

    // Activate text input
    capturedNav.setTextInputActive(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('TextActive:true');

    // Pressing '2', 'q', or ':' should not do anything
    stdin.write('2');
    stdin.write('q');
    stdin.write(':');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:run');

    // Deactivate text input
    capturedNav.setTextInputActive(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('TextActive:false');

    // Now '2' works
    stdin.write('2');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab:tasks');
  });
});
