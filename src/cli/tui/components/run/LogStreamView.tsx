import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useExecution } from '../../context/ExecutionContext.js';

export interface LogStreamViewProps {
  taskId?: string | null;
  logs?: string[];
  isFocused?: boolean;
  maxVisibleLines?: number;
  autoScroll?: boolean;
  borderColor?: string;
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
  if (prev.autoScroll !== next.autoScroll) return false;
  if (prev.borderColor !== next.borderColor) return false;
  if (prev.title !== next.title) return false;
  if (prev.defaultWrap !== next.defaultWrap) return false;
  if (prev.logs === next.logs) return true;
  if (!prev.logs || !next.logs) return false;
  if (prev.logs.length !== next.logs.length) return false;
  if (
    prev.logs.length > 0 &&
    prev.logs[prev.logs.length - 1] !== next.logs[next.logs.length - 1]
  ) {
    return false;
  }
  return true;
}

export const LogStreamView: React.FC<LogStreamViewProps> = React.memo(({
  taskId: propTaskId,
  logs: propLogs,
  isFocused = false,
  maxVisibleLines = 8,
  autoScroll: initialAutoScroll = true,
  borderColor,
  title,
  defaultWrap = true,
}) => {
  const exec = useExecution();
  const effectiveTaskId = propTaskId !== undefined ? propTaskId : exec.selectedTaskId;
  const logs = propLogs !== undefined ? propLogs : (effectiveTaskId ? exec.getTaskLogs(effectiveTaskId) : []);

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
  }, [effectiveTaskId]);

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

  const effectiveBorderColor = borderColor ?? (isFocused ? 'cyan' : 'gray');
  const totalLines = logs.length;
  const startLine = totalLines > 0 ? effectiveScrollStartIndex + 1 : 0;
  const endLine = Math.min(totalLines, effectiveScrollStartIndex + maxVisibleLines);
  const linesAbove = effectiveScrollStartIndex;
  const linesBelow = Math.max(
    0,
    totalLines - (effectiveScrollStartIndex + maxVisibleLines)
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={effectiveBorderColor}
      paddingX={1}
      width="100%"
      flexGrow={1}
    >
      {/* Header with Title and Auto-scroll status */}
      <Box justifyContent="space-between" width="100%" marginBottom={0}>
        <Box gap={1} flexShrink={0}>
          <Text bold color={isFocused ? 'cyan' : 'gray'} wrap="truncate-end">
            {isFocused ? '● ' : ''}{title || `Logs: ${effectiveTaskId ?? 'No Task'}`}
          </Text>
          <Text dimColor wrap="truncate-end">({totalLines} lines)</Text>
        </Box>

        <Box gap={1} flexShrink={0}>
          <Text color={isWrapEnabled ? 'cyan' : 'gray'} bold>
            {isWrapEnabled ? '[Wrap: ON]' : '[Wrap: OFF]'}
          </Text>
          {isAutoScrollEnabled ? (
            <Text color="green" bold>
              [Auto-scroll: ON]
            </Text>
          ) : (
            <Text color="yellow" bold>
              [PAUSED {startLine}-{endLine}/{totalLines}]
            </Text>
          )}
          {isFocused && (
            <Text dimColor color="cyan">[Tab] Tasks</Text>
          )}
        </Box>
      </Box>

      {/* Top Scroll Indicator */}
      {!isAutoScrollEnabled && linesAbove > 0 && (
        <Box justifyContent="center" width="100%">
          <Text dimColor>▲ {linesAbove} more lines above (press 'g' for top)</Text>
        </Box>
      )}

      {/* Log Output */}
      {logs.length === 0 ? (
        <Box paddingY={1}>
          <Text dimColor>
            {effectiveTaskId
              ? 'Waiting for agent output or no logs recorded...'
              : 'No task selected.'}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, idx) => (
            <Text
              key={effectiveScrollStartIndex + idx}
              wrap={isWrapEnabled ? 'wrap' : 'truncate-end'}
            >
              {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Bottom Scroll Indicator */}
      {!isAutoScrollEnabled && linesBelow > 0 && (
        <Box justifyContent="center" width="100%">
          <Text color="yellow">
            ▼ {linesBelow} more lines below (press 'G' to resume auto-scroll)
          </Text>
        </Box>
      )}
    </Box>
  );
}, areLogStreamPropsEqual);

LogStreamView.displayName = 'LogStreamView';
