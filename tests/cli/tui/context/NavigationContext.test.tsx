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

  it('provides default navigation values without activeSpec', () => {
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
    expect(capturedValues?.isTextInputActive).toBe(false);
    expect((capturedValues as Record<string, unknown>)?.activeSpec).toBeUndefined();
  });

  it('respects initialTab', () => {
    let capturedValues: ReturnType<typeof useNavigation> | undefined;

    const TestComponent = () => {
      const nav = useNavigation();
      capturedValues = nav;
      return <Text>Tab: {nav.activeTab}</Text>;
    };

    const { lastFrame } = render(
      <NavigationProvider initialTab="tasks">
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Tab: tasks');
    expect(capturedValues?.activeTab).toBe('tasks');
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
      <NavigationProvider initialTab="run">
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Tab: run');

    // next: run -> specs -> tasks -> docs -> config -> run
    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: specs');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: tasks');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: docs');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: config');

    capturedNav.nextTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: run');

    // prev: run -> config -> docs -> tasks -> specs -> run
    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: config');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: docs');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: tasks');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: specs');

    capturedNav.prevTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Tab: run');
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

  it('manages text input active flag independently of spec', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return (
        <Text>
          Active: {String(capturedNav.isTextInputActive)}
        </Text>
      );
    };

    const { lastFrame } = render(
      <NavigationProvider>
        <TestComponent />
      </NavigationProvider>
    );

    expect(lastFrame()).toContain('Active: false');

    capturedNav.setTextInputActive(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Active: true');

    capturedNav.setTextInputActive(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('Active: false');
  });
});
