import React from "react";
import { render } from "ink";
import { App } from "./tui/App.js";
import { TabId } from "./tui/context/NavigationContext.js";
import { AppContainer } from "../infrastructure/container.js";

export interface RunInteractiveOptions {
  container?: AppContainer;
  initialTab?: TabId;
  initialIntent?: string;  autoStart?: boolean;
}

export async function runInteractiveMenu(options: RunInteractiveOptions = {}): Promise<void> {
  const isTTY = Boolean(process.stdout?.isTTY);
  if (isTTY) {
    // Switch to alternate screen buffer, hide cursor, and clear screen
    process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
  }

  const restoreTerminal = () => {
    if (isTTY) {
      process.stdout.write("\x1b[?25h\x1b[?1049l");
    }
  };

  let cleanedUp = false;
  const cleanup = () => {
    if (!cleanedUp) {
      cleanedUp = true;
      restoreTerminal();
    }
  };

  const selectedIntent = options.initialIntent ?? options.initialIntent;

  const instance = render(
    React.createElement(App, {
      container: options.container,
      initialTab: options.initialTab,
      initialIntent: selectedIntent,      autoStart: options.autoStart,
      enableAlternateScreen: false,
      onExit: () => {
        instance.unmount();
        cleanup();
      },
    }),
    // Avoid erasing the entire viewport for every log, timer, or input update.
    { incrementalRendering: true }
  );

  const sigintHandler = () => {
    instance.unmount();
    cleanup();
    process.exit(0);
  };

  const exitHandler = () => {
    cleanup();
  };

  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigintHandler);
  process.on("exit", exitHandler);

  try {
    await instance.waitUntilExit();
  } finally {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigintHandler);
    process.off("exit", exitHandler);
    cleanup();
  }
}
