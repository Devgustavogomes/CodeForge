import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import {
  NavigationProvider,
  useNavigation,
} from '../../../../src/cli/tui/context/NavigationContext.js';
import { flushAsync } from '../helpers/flushAsync.js';

describe('NavigationContext', () => {
  it('starts at configured initial tab or default intents tab', () => {
    let defaultNav: ReturnType<typeof useNavigation> | undefined;
    const DefaultConsumer = () => {
      defaultNav = useNavigation();
      return null;
    };

    const { unmount: unmountDefault } = render(
      <NavigationProvider>
        <DefaultConsumer />
      </NavigationProvider>,
    );

    expect(defaultNav?.activeTab).toBe('intents');
    unmountDefault();

    let customNav: ReturnType<typeof useNavigation> | undefined;
    const CustomConsumer = () => {
      customNav = useNavigation();
      return null;
    };

    const { unmount: unmountCustom } = render(
      <NavigationProvider initialTab="tasks">
        <CustomConsumer />
      </NavigationProvider>,
    );

    expect(customNav?.activeTab).toBe('tasks');
    unmountCustom();
  });

  it('cycles tabs forward and backward with nextTab and prevTab', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;
    const TestComponent = () => {
      capturedNav = useNavigation();
      return null;
    };

    const { unmount } = render(
      <NavigationProvider initialTab="run">
        <TestComponent />
      </NavigationProvider>,
    );

    expect(capturedNav.activeTab).toBe('run');

    // next: run -> intents -> tasks -> docs -> config -> run
    capturedNav.nextTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('intents');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('tasks');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('docs');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('config');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('run');

    // prev: run -> config -> docs -> tasks -> intents -> run
    capturedNav.prevTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('config');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('docs');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('tasks');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('intents');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(capturedNav.activeTab).toBe('run');

    unmount();
  });
});
