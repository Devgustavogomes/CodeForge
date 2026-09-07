import React from "react";
import { render } from "ink";
import { App } from "./tui/App.js";

export async function runInteractiveMenu(): Promise<void> {
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

  const instance = render(
    React.createElement(App, {
      enableAlternateScreen: false,
      onExit: () => {
        instance.unmount();
        cleanup();
      },
    })
  );

  const sigintHandler = () => {
    instance.unmount();
    cleanup();
    process.exit(0);
  };

  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigintHandler);

  try {
    await instance.waitUntilExit();
  } finally {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigintHandler);
    cleanup();
  }
}
