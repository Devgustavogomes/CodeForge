import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useExecution } from '../../context/ExecutionContext.js';
import { theme } from '../../theme.js';

export interface LogStreamViewProps {
  taskId?: string | null;
  logs?: string[];
  isFocused?: boolean;
  maxVisibleLines?: number;
  height?: number;
  autoScroll?: boolean;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
  title?: string;
  defaultWrap?: boolean;
}

export function areLogStreamPropsEqual(
  prev: LogStreamViewProps,
  next: LogStreamViewProps
): boolean {
  if (prev.taskId !== next.taskId) return false;
  if (prev.isFocused !== next.isFocused) return false;
  if (prev.maxVisibleLines !== next.maxVisibleLines) return false;
  if (prev.height !== next.height) return false;
  if (prev.autoScroll !== next.autoScroll) return false;
  if (prev.borderColor !== next.borderColor) return false;
  if (prev.borderStyle !== next.borderStyle) return false;
  if (prev.title !== next.title) return false;
  if (prev.defaultWrap !== next.defaultWrap) return false;
  if (prev.logs === next.logs) return true;
  if (!prev.logs && !next.logs) return true;
  if (!prev.logs || !next.logs) return false;
  if (prev.logs.length !== next.logs.length) return false;
  if (prev.logs.length === 0) return true;
  if (
    prev.logs[prev.logs.length - 1] !== next.logs[next.logs.length - 1] ||
    prev.logs[0] !== next.logs[0]
  ) {
    return false;
  }
  return true;
}

const LogStreamViewPresenter: React.FC<LogStreamViewProps> = React.memo(({
  taskId,
  logs = [],
  isFocused = false,
  maxVisibleLines = 8,
  height,
  autoScroll: initialAutoScroll = true,
  borderColor,
  borderStyle = 'round',
  title,
  defaultWrap = true,
}) => {
  // Wrap toggle state: default true (Wrap: ON)
  const [isWrapEnabled, setIsWrapEnabled] = useState(defaultWrap);

  // Auto-scroll state: true when attached to the bottom
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(initialAutoScroll);
  // Manual scroll offset from top when auto-scroll is disabled
  const [scrollStartIndex, setScrollStartIndex] = useState<number>(() =>
    initialAutoScroll ? Math.max(0, logs.length - maxVisibleLines) : 0
  );

  const bottomStartIndex = Math.max(0, logs.length - maxVisibleLines);
  const effectiveScrollStartIndex = isAutoScrollEnabled
    ? bottomStartIndex
    : Math.min(scrollStartIndex, bottomStartIndex);

  // Reset scroll when selected task changes
  useEffect(() => {
    setIsAutoScrollEnabled(true);
    setScrollStartIndex(Math.max(0, logs.length - maxVisibleLines));
  }, [taskId]);

  // Keyboard navigation for scrolling and wrap toggle when focused
  useInput(
    (input, key) => {
      if (!isFocused) return;

      // Toggle wrap: 'w'
      if (input === 'w') {
        setIsWrapEnabled((prev) => !prev);
        return;
      }

      if (logs.length === 0) return;

      // Scroll up: Up arrow or 'k'
      if (key.upArrow || input === 'k') {
        setIsAutoScrollEnabled(false);
        setScrollStartIndex(Math.max(0, effectiveScrollStartIndex - 1));
        return;
      }

      // Scroll down: Down arrow or 'j'
      if (key.downArrow || input === 'j') {
        const next = Math.min(bottomStartIndex, effectiveScrollStartIndex + 1);
        if (next >= bottomStartIndex) {
          setIsAutoScrollEnabled(true);
        } else {
          setIsAutoScrollEnabled(false);
        }
        setScrollStartIndex(next);
        return;
      }

      // Page Up
      if (key.pageUp) {
        setIsAutoScrollEnabled(false);
        setScrollStartIndex(Math.max(0, effectiveScrollStartIndex - maxVisibleLines));
        return;
      }

      // Page Down
      if (key.pageDown) {
        const next = Math.min(bottomStartIndex, effectiveScrollStartIndex + maxVisibleLines);
        if (next >= bottomStartIndex) {
          setIsAutoScrollEnabled(true);
        } else {
          setIsAutoScrollEnabled(false);
        }
        setScrollStartIndex(next);
        return;
      }

      // Jump to bottom: 'G' or End
      if (input === 'G' || key.end) {
        setIsAutoScrollEnabled(true);
        setScrollStartIndex(bottomStartIndex);
        return;
      }

      // Jump to top: 'g' or Home
      if (input === 'g' || key.home) {
        setIsAutoScrollEnabled(false);
        setScrollStartIndex(0);
        return;
      }
    },
    { isActive: isFocused }
  );

  // Compute visible lines window
  const visibleLines = useMemo(() => {
    if (logs.length === 0) return [];
    return logs.slice(
      effectiveScrollStartIndex,
      effectiveScrollStartIndex + maxVisibleLines
    );
  }, [logs, effectiveScrollStartIndex, maxVisibleLines]);

  const effectiveBorderColor = borderColor ?? (isFocused ? theme.colors.borderActive : theme.colors.borderSubtle);
  const totalLines = logs.length;
  const startLine = totalLines > 0 ? effectiveScrollStartIndex + 1 : 0;
  const endLine = Math.min(totalLines, effectiveScrollStartIndex + maxVisibleLines);
  const linesAbove = effectiveScrollStartIndex;
  const linesBelow = Math.max(
    0,
    totalLines - (effectiveScrollStartIndex + maxVisibleLines)
  );

  const displayTitle = title ?? (taskId ? `Logs: ${taskId}` : 'Execution Logs');
  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      flexDirection="column"
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : effectiveBorderColor}
      paddingX={isNoneBorder ? 0 : 1}
      width="100%"
      height={height}
      flexGrow={1}
      overflow="hidden"
    >
      {/* Header bar */}
      <Box justifyContent="space-between" width="100%" marginBottom={0} flexShrink={0}>
        <Box gap={1} flexShrink={0}>
          <Text bold color={isFocused ? theme.colors.primary : theme.colors.muted}>
            {isFocused ? '● ' : '  '}{displayTitle}
          </Text>
          <Text dimColor>({totalLines} lines)</Text>
        </Box>

        <Box gap={1} flexShrink={1}>
          <Text dimColor color={isWrapEnabled ? theme.colors.text : theme.colors.muted} wrap="truncate-end">
            [Wrap: {isWrapEnabled ? 'ON' : 'OFF'}]
          </Text>
          <Text color={theme.colors.borderSubtle}>│</Text>
          {isAutoScrollEnabled ? (
            <Text color={theme.colors.success} wrap="truncate-end">[Auto-scroll: ON]</Text>
          ) : (
            <Text color={theme.colors.warning} wrap="truncate-end">
              [PAUSED: {startLine}-{endLine}/{totalLines}]
            </Text>
          )}
        </Box>
      </Box>

      {/* Scroll indicator: Lines above */}
      {linesAbove > 0 && (
        <Box justifyContent="center" width="100%" flexShrink={0}>
          <Text dimColor color={theme.colors.warning} wrap="truncate-end">
            ▲ {linesAbove} line{linesAbove === 1 ? '' : 's'} above (press 'g' for top)
          </Text>
        </Box>
      )}

      {/* Log lines content */}
      {logs.length === 0 ? (
        <Box paddingY={1} flexGrow={1} overflow="hidden">
          <Text dimColor wrap="truncate-end">Waiting for agent output or no logs recorded...</Text>
        </Box>
      ) : (
        <Box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
          {visibleLines.map((line, idx) => {
            let color: string | undefined = undefined;
            let bold = false;
            let dimColor = false;

            const trimmed = line.trimStart();
            if (/^(\[ERROR\]|error:|fatal:|stderr:|Exception)/i.test(trimmed)) {
              color = theme.colors.error;
              bold = true;
            } else if (/^(\[WARN\]|\[WARNING\]|warning:)/i.test(trimmed)) {
              color = theme.colors.warning;
            } else if (/^(\[INFO\]|info:)/i.test(trimmed)) {
              color = theme.colors.accent;
            } else if (/^(\[SUCCESS\]|success:|✓)/i.test(trimmed)) {
              color = theme.colors.success;
              bold = true;
            } else if (/^(\d{4}-\d{2}-\d{2}|\[\d{2}:\d{2}:\d{2}\])/.test(trimmed)) {
              dimColor = true;
            }

            return (
              <Text
                key={effectiveScrollStartIndex + idx}
                color={color}
                bold={bold}
                dimColor={dimColor}
                wrap={isWrapEnabled ? 'wrap' : 'truncate-end'}
              >
                {line}
              </Text>
            );
          })}
        </Box>
      )}

      {/* Scroll indicator: Lines below */}
      {linesBelow > 0 && !isAutoScrollEnabled && (
        <Box justifyContent="center" width="100%" flexShrink={0}>
          <Text dimColor color={theme.colors.warning} wrap="truncate-end">
            ▼ {linesBelow} line{linesBelow === 1 ? '' : 's'} below (press 'G' to resume)
          </Text>
        </Box>
      )}
    </Box>
  );
}, areLogStreamPropsEqual);

LogStreamViewPresenter.displayName = 'LogStreamViewPresenter';

const LogStreamViewWithContext: React.FC<LogStreamViewProps> = (props) => {
  const exec = useExecution();
  const effectiveTaskId = props.taskId !== undefined ? props.taskId : exec.selectedTaskId;
  const logs = effectiveTaskId ? exec.getTaskLogs(effectiveTaskId) : [];

  return (
    <LogStreamViewPresenter
      {...props}
      taskId={effectiveTaskId}
      logs={logs}
    />
  );
};

export const LogStreamView: React.FC<LogStreamViewProps> = (props) => {
  if (props.logs !== undefined) {
    return <LogStreamViewPresenter {...props} />;
  }
  return <LogStreamViewWithContext {...props} />;
};

LogStreamView.displayName = 'LogStreamView';
