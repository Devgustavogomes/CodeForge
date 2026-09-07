import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { CommandPalette } from '../../../src/cli/tui/components/common/CommandPalette.js';
import {
  NavigationProvider,
  useNavigation,
} from '../../../src/cli/tui/context/NavigationContext.js';
import { CommandActionItem } from '../../../src/cli/tui/components/common/commandRegistry.js';

describe('CommandPalette component', () => {
  it('renders command palette overlay with header, search box, badges, and commands when open', () => {
    const { lastFrame } = render(<CommandPalette isOpen={true} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('Command Palette');
    expect(output).toContain('[Esc] Close');
    expect(output).toContain('>');
    expect(output).toContain('Type to search commands...');
    expect(output).toContain('[RUN]');
    expect(output).toContain('Run Spec Execution');
    expect(output).toContain('Spec List');
    expect(output).toContain('↑/↓ Navigate · Enter Select');
  });

  it('renders nothing when isOpen is false', () => {
    const { lastFrame } = render(<CommandPalette isOpen={false} />);
    const output = lastFrame() ?? '';

    expect(output).toBe('');
  });

  it('filters command list in real time as user types into search input', async () => {
    const { lastFrame, stdin } = render(<CommandPalette isOpen={true} />);

    expect(lastFrame()).toContain('Run Spec Execution');

    // Type "docs"
    stdin.write('docs');
    await new Promise((r) => setTimeout(r, 30));

    const filtered = lastFrame() ?? '';
    expect(filtered).toContain('Docs Create');
    expect(filtered).toContain('Docs Update');
    expect(filtered).not.toContain('Run Spec Execution');

    // Backspace to erase
    stdin.write('\x08\x08\x08\x08');
    await new Promise((r) => setTimeout(r, 30));

    expect(lastFrame()).toContain('Run Spec Execution');
  });

  it('displays "No matching commands found" when query does not match', async () => {
    const { lastFrame, stdin } = render(<CommandPalette isOpen={true} />);

    stdin.write('xyznonexistent');
    await new Promise((r) => setTimeout(r, 30));

    expect(lastFrame()).toContain('No matching commands found');
  });

  it('navigates through items with arrow keys and vim keys (j/k)', async () => {
    const mockCommands: CommandActionItem[] = [
      { id: '1', title: 'First Command', category: 'run', description: 'Desc 1', action: vi.fn() },
      { id: '2', title: 'Second Command', category: 'spec', description: 'Desc 2', action: vi.fn() },
      { id: '3', title: 'Third Command', category: 'task', description: 'Desc 3', action: vi.fn() },
    ];

    const { lastFrame, stdin } = render(
      <CommandPalette isOpen={true} commands={mockCommands} />
    );

    // Initial item 1 selected
    expect(lastFrame()).toMatch(/❯\s+\[RUN\]\s+First Command/);

    // Press down arrow (\u001B[B)
    stdin.write('\u001B[B');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/❯\s+\[SPEC\]\s+Second Command/);

    // Press down via 'j' (query is empty)
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/❯\s+\[TASK\]\s+Third Command/);

    // Press up via 'k' (query is empty)
    stdin.write('k');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/❯\s+\[SPEC\]\s+Second Command/);

    // Press up arrow (\u001B[A)
    stdin.write('\u001B[A');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/❯\s+\[RUN\]\s+First Command/);
  });

  it('executes selected command on Enter and closes palette', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const mockCommands: CommandActionItem[] = [
      { id: '1', title: 'Action 1', category: 'run', description: 'Desc 1', action: onAction },
      { id: '2', title: 'Action 2', category: 'spec', description: 'Desc 2', action: vi.fn() },
    ];

    const { stdin } = render(
      <CommandPalette
        isOpen={true}
        onClose={onClose}
        commands={mockCommands}
      />
    );

    // Press Enter
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 20));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape without executing any action', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const mockCommands: CommandActionItem[] = [
      { id: '1', title: 'Action 1', category: 'run', description: 'Desc 1', action: onAction },
    ];

    const { stdin } = render(
      <CommandPalette
        isOpen={true}
        onClose={onClose}
        commands={mockCommands}
      />
    );

    // Press Escape (\u001B)
    stdin.write('\u001B');
    await new Promise((r) => setTimeout(r, 20));

    expect(onAction).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('integrates with NavigationContext to navigate tabs and open modals', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestApp: React.FC = () => {
      capturedNav = useNavigation();
      return (
        <>
          <CommandPalette />
        </>
      );
    };

    const { lastFrame, stdin } = render(
      <NavigationProvider initialTab="run">
        <TestApp />
      </NavigationProvider>
    );

    // Palette initially closed
    expect(lastFrame()).toBe('');
    expect(capturedNav.isTextInputActive).toBe(false);

    // Open palette
    capturedNav.openCommandPalette();
    await new Promise((r) => setTimeout(r, 100));

    expect(lastFrame()).toContain('Command Palette');
    expect(capturedNav.isTextInputActive).toBe(true);

    // Type "config" to filter
    stdin.write('config');
    await new Promise((r) => setTimeout(r, 100));

    expect(lastFrame()).toContain('Config');

    // Press Enter to select Config
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 100));

    // Navigated to 'config' tab, palette closed, text input restored to false
    expect(capturedNav.activeTab).toBe('config');
    expect(capturedNav.isCommandPaletteOpen).toBe(false);
    expect(capturedNav.isTextInputActive).toBe(false);
  });

  it('opens modal dialogs like create_spec from NavigationContext', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestApp: React.FC = () => {
      capturedNav = useNavigation();
      return (
        <>
          <CommandPalette />
        </>
      );
    };

    const { stdin } = render(
      <NavigationProvider initialTab="run">
        <TestApp />
      </NavigationProvider>
    );

    // Open palette
    capturedNav.openCommandPalette();
    await new Promise((r) => setTimeout(r, 100));

    // Type "spec create"
    stdin.write('spec create');
    await new Promise((r) => setTimeout(r, 100));

    // Press Enter
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 100));

    // Should navigate to specs and open create_spec modal
    expect(capturedNav.activeTab).toBe('specs');
    expect(capturedNav.modal?.type).toBe('create_spec');
    expect(capturedNav.isCommandPaletteOpen).toBe(false);
  });
});
