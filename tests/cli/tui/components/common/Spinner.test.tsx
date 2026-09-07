import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Spinner, SPINNER_FRAMES } from '../../../../../src/cli/tui/components/common/Spinner.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Spinner component', () => {
  it('renders initial frame', () => {
    const { lastFrame } = render(<Spinner color="cyan" />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
  });

  it('advances frames every interval', async () => {
    const { lastFrame } = render(<Spinner color="cyan" interval={30} />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);

    let advanced = false;
    for (let i = 0; i < 20; i++) {
      await sleep(25);
      if (lastFrame()?.includes(SPINNER_FRAMES[1])) {
        advanced = true;
        break;
      }
    }
    expect(advanced).toBe(true);
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<Spinner color="cyan" />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
