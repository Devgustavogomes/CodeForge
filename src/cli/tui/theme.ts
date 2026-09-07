export const theme = {
  colors: {
    primary: 'cyan' as const,
    accent: 'blue' as const,
    success: 'green' as const,
    warning: 'yellow' as const,
    error: 'red' as const,
    muted: 'gray' as const,
    text: 'white' as const,
    textDim: 'gray' as const,
    borderSubtle: 'gray' as const,
    borderActive: 'cyan' as const,
  },
  status: {
    running: {
      color: 'cyan' as const,
      icon: '▶',
      label: 'RUNNING',
    },
    completed: {
      color: 'green' as const,
      icon: '✓',
      label: 'COMPLETED',
    },
    failed: {
      color: 'red' as const,
      icon: '✗',
      label: 'FAILED',
    },
    pending: {
      color: 'gray' as const,
      icon: '○',
      label: 'PENDING',
    },
    deadlock: {
      color: 'red' as const,
      icon: '⚠',
      label: 'DEADLOCK',
    },
    idle: {
      color: 'gray' as const,
      icon: '●',
      label: 'IDLE',
    },
  },
  symbols: {
    pointer: '▌',
    bullet: '•',
    divider: '│',
    horizontalLine: '─',
    barFilled: '█',
    barEmpty: '░',
    barSmoothFilled: '━',
    barSmoothEmpty: '─',
  },
};

export type ThemeStatusKey = keyof typeof theme.status;

export function getStatusTheme(status: string) {
  const key = status.toLowerCase() as ThemeStatusKey;
  return theme.status[key] ?? theme.status.pending;
}

export function renderProgressBar(
  completed: number,
  total: number,
  barWidth: number = 20,
): string {
  if (total <= 0) {
    return `[${theme.symbols.barEmpty.repeat(barWidth)}] 0% (0/0)`;
  }
  const fraction = Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(fraction * barWidth);
  const empty = barWidth - filled;
  const percent = Math.round(fraction * 100);
  return `[${theme.symbols.barFilled.repeat(filled)}${theme.symbols.barEmpty.repeat(empty)}] ${percent}% (${completed}/${total})`;
}
