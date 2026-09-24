import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ink', () => ({
  render: vi.fn(),
}));

import { render } from 'ink';
import { runInteractiveMenu } from '../../src/cli/interactive.js';

describe('runInteractiveMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders App, switches to alternate buffer, and restores terminal on exit', async () => {
    const unmountMock = vi.fn();
    const waitUntilExitMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(render).mockReturnValue({
      unmount: unmountMock,
      waitUntilExit: waitUntilExitMock,
    } as any);

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const originalIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      await runInteractiveMenu();

      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(expect.anything(), { incrementalRendering: true });
      expect(waitUntilExitMock).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[?1049h'));
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[?1049l'));
    } finally {
      process.stdout.isTTY = originalIsTTY;
      writeSpy.mockRestore();
    }
  });

  it('handles SIGINT gracefully during interactive menu execution', async () => {
    let capturedOnExit: (() => void) | undefined;
    const unmountMock = vi.fn();
    const waitUntilExitMock = vi.fn().mockImplementation(() => {
      // Simulate onExit being invoked
      if (capturedOnExit) capturedOnExit();
      return Promise.resolve();
    });

    vi.mocked(render).mockImplementation((element: any) => {
      capturedOnExit = element.props?.onExit;
      return {
        unmount: unmountMock,
        waitUntilExit: waitUntilExitMock,
      } as any;
    });

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runInteractiveMenu();

    expect(unmountMock).toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});
