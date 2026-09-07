import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  NavigationProvider,
  useNavigation,
} from '../../../../src/cli/tui/context/NavigationContext.js';

describe('NavigationContext', () => {
  it('throws an error when useNavigation is used outside NavigationProvider', () => {
    let error: Error | null = null;
    const TestComponent = () => {
      try {
        useNavigation();
      } catch (err) {
        error = err as Error;
      }
      return <Text>Rendered</Text>;
    };

    render(<TestComponent />);
    expect(error).not.toBeNull();
    expect(error?.message).toBe('useNavigation must be used within a NavigationProvider');
  });

  it('provides default navigation values', () => {
    let capturedValues: ReturnType<typeof useNavigation> | undefined;

    const TestComponent = () => {
      const nav = useNavigation();
      capturedValues = nav;
      return <Text>Active Tab: {nav.activeTab}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider>
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Active Tab: specs');
    expect(capturedValues).toBeDefined();
    expect(capturedValues?.activeTab).toBe('specs');
    expect(capturedValues?.modal).toBeNull();
    expect(capturedValues?.isCommandPaletteOpen).toBe(false);
    expect(capturedValues?.isTextInputActive).toBe(false);
    expect(capturedValues?.activeSpec).toBeNull();
  });

  it('respects initialTab and initialActiveSpec', () => {
    let capturedValues: ReturnType<typeof useNavigation> | undefined;

    const TestComponent = () => {
      const nav = useNavigation();
      capturedValues = nav;
      return <Text>Spec: {nav.activeSpec}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider initialTab="specs" initialActiveSpec="user-auth">
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Spec: user-auth');
    expect(capturedValues?.activeTab).toBe('specs');
    expect(capturedValues?.activeSpec).toBe('user-auth');
  });

  it('updates activeTab with setActiveTab', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return <Text>Tab: {capturedNav.activeTab}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider>
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Tab: specs');

    capturedNav.setActiveTab('tasks');
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('Tab: tasks');
    expect(capturedNav.activeTab).toBe('tasks');
  });

  it('cycles tabs forward and backward with nextTab and prevTab', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return <Text>Tab: {capturedNav.activeTab}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider initialTab="specs">
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Tab: specs');

    // next: specs -> tasks -> run -> docs -> config -> specs
    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: tasks');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: run');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: docs');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: config');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: specs');

    // prev: specs -> config -> docs -> run -> tasks -> specs
    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: config');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: docs');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: run');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: tasks');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: specs');
  });

  it('handles modal state open and close', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return <Text>Modal: {capturedNav.modal?.type ?? 'none'}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider>
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Modal: none');

    capturedNav.openModal('create_spec', { initialName: 'test' });
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('Modal: create_spec');
    expect(capturedNav.modal).toEqual({
      type: 'create_spec',
      props: { initialName: 'test' },
    });

    capturedNav.closeModal();
    await new Promise((r) => setTimeout(r, 20));

    expect(lastFrame()).toContain('Modal: none');
    expect(capturedNav.modal).toBeNull();
  });

  it('manages command palette visibility', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return <Text>Palette: {String(capturedNav.isCommandPaletteOpen)}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider>
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Palette: false');

    capturedNav.openCommandPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette: true');

    capturedNav.closeCommandPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette: false');

    capturedNav.toggleCommandPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette: true');

    capturedNav.toggleCommandPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Palette: false');
  });

  it('manages text input active flag and activeSpec', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return (
        <Text>
          Active: {String(capturedNav.isTextInputActive)} | Spec: {capturedNav.activeSpec ?? 'none'}
        </Text>
      );
    };

    const { lastFrame } = render(
      <NavigationProvider>
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Active: false | Spec: none');

    capturedNav.setTextInputActive(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Active: true | Spec: none');

    capturedNav.setTextInputActive(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Active: false | Spec: none');

    capturedNav.setActiveSpec('new-spec');
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Active: false | Spec: new-spec');
  });
});
