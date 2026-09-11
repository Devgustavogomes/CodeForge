import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  NavigationProvider,
  useNavigation,
} from '../../../../src/cli/tui/context/NavigationContext.js';
import { flushAsync } from '../helpers/flushAsync.js';

describe('NavigationContext', () => {
  it('starts at configured initial tab or default specs tab', () => {
    let defaultNav: ReturnType<typeof useNavigation> | undefined;
    const DefaultConsumer = () => {
      defaultNav = useNavigation();
      return <Text>Tab: {defaultNav.activeTab}</Text>;
    };

    const { lastFrame: defaultFrame, unmount: unmountDefault } = render(
      <NavigationProvider>
        <DefaultConsumer />
      </NavigationProvider>,
    );

    expect(defaultFrame()).toContain('Tab: specs');
    expect(defaultNav?.activeTab).toBe('specs');
    unmountDefault();

    let customNav: ReturnType<typeof useNavigation> | undefined;
    const CustomConsumer = () => {
      customNav = useNavigation();
      return <Text>Tab: {customNav.activeTab}</Text>;
    };

    const { lastFrame: customFrame, unmount: unmountCustom } = render(
      <NavigationProvider initialTab="tasks">
        <CustomConsumer />
      </NavigationProvider>,
    );

    expect(customFrame()).toContain('Tab: tasks');
    expect(customNav?.activeTab).toBe('tasks');
    unmountCustom();
  });

  it('cycles tabs forward and backward with nextTab and prevTab', async () => {
    let capturedNav!: ReturnType<typeof useNavigation>;

    const TestComponent = () => {
      capturedNav = useNavigation();
      return <Text>Tab: {capturedNav.activeTab}</Text>;
    };

    const { lastFrame, unmount } = render(
      <NavigationProvider initialTab="run">
        <TestComponent />
      </NavigationProvider>,
    );

    expect(lastFrame()).toContain('Tab: run');

    // next: run -> specs -> tasks -> docs -> config -> run
    capturedNav.nextTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: specs');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: tasks');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: docs');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: config');

    capturedNav.nextTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: run');

    // prev: run -> config -> docs -> tasks -> specs -> run
    capturedNav.prevTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: config');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: docs');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: tasks');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: specs');

    capturedNav.prevTab();
    await flushAsync(1);
    expect(lastFrame()).toContain('Tab: run');

    unmount();
  });
});
