import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { HooksPanel } from '../../../../src/cli/tui/components/run/components/HooksPanel.js';
import {
  ActiveHookState,
  HookHistoryItem,
} from '../../../../src/cli/tui/context/ExecutionContext.js';

describe('HooksPanel', () => {
  it('renders unconfigured state when hasConfiguredHooks is false', () => {
    const { lastFrame } = render(<HooksPanel hasConfiguredHooks={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Lifecycle Hooks');
    expect(frame).toContain('No hooks configured in config.yaml');
  });

  it('renders idle state when hooks are configured but no hook is active', () => {
    const { lastFrame } = render(<HooksPanel hasConfiguredHooks={true} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Lifecycle Hooks');
    expect(frame).not.toContain('(Active: 1)');
    expect(frame).toContain('Idle (Waiting for lifecycle events)');
  });

  it('renders active hook details, command, elapsed time and GATE badge', () => {
    const activeHook: ActiveHookState = {
      name: 'lint',
      event: 'task.verify',
      command: 'npm run lint -- --filter=task-1',
      type: 'gate',
      startedAt: Date.now() - 1200,
    };

    const { lastFrame } = render(<HooksPanel activeHook={activeHook} />);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Lifecycle Hooks (Active: 1)');
    expect(frame).toContain('[task.verify]');
    expect(frame).toContain('lint');
    expect(frame).toContain('[GATE]');
    expect(frame).toContain('Command:');
    expect(frame).toContain('npm run lint -- --filter=task-1');
    expect(frame).toContain('Elapsed:');
    expect(frame).toMatch(/Elapsed:\s+\d+\.\d+s/);
  });

  it('renders active hook with NOTIFY badge', () => {
    const activeHook: ActiveHookState = {
      name: 'notify-slack',
      event: 'task.started',
      command: 'curl -X POST https://slack.com/api',
      type: 'notify',
      startedAt: Date.now() - 500,
    };

    const { lastFrame } = render(<HooksPanel activeHook={activeHook} />);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Lifecycle Hooks (Active: 1)');
    expect(frame).toContain('[task.started]');
    expect(frame).toContain('notify-slack');
    expect(frame).toContain('[NOTIFY]');
  });

  it('renders recent hook history with success, exit codes, and error summary', () => {
    const hookHistory: HookHistoryItem[] = [
      {
        id: 'hook-1',
        name: 'notify-slack',
        event: 'task.started',
        command: 'slack-notify',
        type: 'notify',
        ok: true,
        exitCode: 0,
        durationMs: 400,
        timestamp: new Date().toISOString(),
      },
      {
        id: 'hook-2',
        name: 'typecheck',
        event: 'task.verify',
        command: 'npm run typecheck',
        type: 'gate',
        ok: false,
        exitCode: 1,
        outputSummary: "TS2322: Type 'string' is not assignable to 'num'",
        durationMs: 1200,
        timestamp: new Date().toISOString(),
      },
    ];

    const { lastFrame } = render(
      <HooksPanel hasConfiguredHooks={true} hookHistory={hookHistory} />,
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Recent:');
    expect(frame).toContain('✔');
    expect(frame).toContain('[task.started]');
    expect(frame).toContain('notify-slack');
    expect(frame).toContain('(0.4s)');

    expect(frame).toContain('✖');
    expect(frame).toContain('[task.verify]');
    expect(frame).toContain('typecheck');
    expect(frame).toContain('(exit 1)');
    expect(frame).toContain('[GATE]');
    expect(frame).toContain("↳ TS2322: Type 'string' is not assignable to 'num'");
  });

  it('truncates long commands gracefully without throwing', () => {
    const longCommand = 'npm run lint --verbose --all --very-long-argument=' + 'x'.repeat(300);
    const activeHook: ActiveHookState = {
      name: 'long-command-hook',
      event: 'run.started',
      command: longCommand,
      type: 'notify',
      startedAt: Date.now(),
    };

    const { lastFrame } = render(<HooksPanel activeHook={activeHook} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Lifecycle Hooks (Active: 1)');
    expect(frame).toContain('long-command-hook');
  });

  it('supports internationalization in pt and es', () => {
    const { lastFrame: lastFramePt } = render(
      <HooksPanel hasConfiguredHooks={false} language="pt" />,
    );
    expect(lastFramePt() ?? '').toContain('Hooks de Ciclo de Vida');
    expect(lastFramePt() ?? '').toContain('Nenhum hook configurado no config.yaml');

    const { lastFrame: lastFrameEs } = render(
      <HooksPanel hasConfiguredHooks={false} language="es" />,
    );
    expect(lastFrameEs() ?? '').toContain('Hooks de Ciclo de Vida');
    expect(lastFrameEs() ?? '').toContain('Ningún hook configurado en config.yaml');
  });

  it('slices history according to maxHeight constraint', () => {
    const historyItems: HookHistoryItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `h-${i}`,
      name: `hook-${i}`,
      event: 'task.completed',
      command: `cmd-${i}`,
      type: 'notify',
      ok: true,
      exitCode: 0,
      durationMs: 100 * (i + 1),
      timestamp: new Date().toISOString(),
    }));

    const { lastFrame } = render(
      <HooksPanel
        hasConfiguredHooks={true}
        hookHistory={historyItems}
        maxHeight={8}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('hook-0');
    // Limited items should be rendered
    expect(frame).not.toContain('hook-9');
  });
});
