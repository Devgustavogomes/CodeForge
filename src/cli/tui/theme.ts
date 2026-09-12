export const theme = {
  colors: {
    primary: '#3b82f6' as const,
    accent: '#38bdf8' as const,
    success: '#22c55e' as const,
    warning: '#eab308' as const,
    error: '#ef4444' as const,
    muted: '#64748b' as const,
    text: 'white' as const,
    textDim: '#64748b' as const,
    borderSubtle: '#334155' as const,
    borderActive: '#3b82f6' as const,
    bgEmpty: '#1e293b' as const,
  },
  status: {
    running: {
      color: '#3b82f6' as const,
      icon: '▶',
      label: 'RUNNING',
    },
    completed: {
      color: '#22c55e' as const,
      icon: '✓',
      label: 'COMPLETED',
    },
    failed: {
      color: '#ef4444' as const,
      icon: '✗',
      label: 'FAILED',
    },
    pending: {
      color: '#64748b' as const,
      icon: '○',
      label: 'PENDING',
    },
    deadlock: {
      color: '#ef4444' as const,
      icon: '⚠',
      label: 'DEADLOCK',
    },
    idle: {
      color: '#64748b' as const,
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
