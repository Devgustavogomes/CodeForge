/**
 * TUI Theme Definition
 *
 * Defines the design system tokens including color palettes, status visual markers,
 * ASCII symbols, and helper utilities for status rendering and progress bars.
 */
export const theme = {
  /**
   * Color palette used across the TUI interface.
   * All color hex values are strictly preserved to maintain visual consistency (RNF01).
   */
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

  /**
   * Status indicators with universal ASCII markers safe for Windows terminals (RF02, RNF02).
   */
  status: {
    running: {
      color: '#3b82f6' as const,
      icon: '[>]',
      label: 'RUNNING',
    },
    completed: {
      color: '#22c55e' as const,
      icon: '[v]',
      label: 'COMPLETED',
    },
    failed: {
      color: '#ef4444' as const,
      icon: '[x]',
      label: 'FAILED',
    },
    pending: {
      color: '#64748b' as const,
      icon: '[ ]',
      label: 'PENDING',
    },
    deadlock: {
      color: '#ef4444' as const,
      icon: '[!]',
      label: 'DEADLOCK',
    },
    idle: {
      color: '#64748b' as const,
      icon: '[-]',
      label: 'IDLE',
    },
  },

  /**
   * Visual symbols and bar characters used for layout borders and progress indicators.
   */
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

/**
 * Valid keys for the theme status map.
 */
export type ThemeStatusKey = keyof typeof theme.status;

/**
 * Retrieves the status theme configuration for a given status string.
 * Falls back to the pending status theme if the key is unknown.
 *
 * @param status - The status name to look up.
 * @returns The status theme configuration containing color, icon, and label.
 */
export function getStatusTheme(status: string) {
  const key = status.toLowerCase() as ThemeStatusKey;
  return theme.status[key] ?? theme.status.pending;
}

/**
 * Renders a visual text-based progress bar.
 *
 * @param completed - Number of completed items.
 * @param total - Total number of items.
 * @param barWidth - The character width of the progress bar (default: 20).
 * @returns Formatted progress bar string with brackets, percentage, and ratio.
 */
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
