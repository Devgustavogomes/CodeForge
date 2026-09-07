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
}

export const LogStreamView: React.FC<LogStreamViewProps> = ({
  taskId: propTaskId,
  logs: propLogs,
  isFocused = false,
  maxVisibleLines = 8,
  autoScroll: initialAutoScroll = true,
  borderColor,
  title,
}) => {
  let execTaskId: string | null = null;
  let execLogs: string[] = [];

  try {
    const exec = useExecution();
    execTaskId = exec.selectedTaskId;
    const activeId = propTaskId !== undefined ? propTaskId : execTaskId;
    if (activeId) {
      execLogs = exec.getTaskLogs(activeId);
    }
  } catch {
    // Outside ExecutionProvider
  }

  const effectiveTaskId = propTaskId !== undefined ? propTaskId : execTaskId;
  const logs = propLogs !== undefined ? propLogs : execLogs;

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
    setScrollStartIndex(bottomStartIndex);
  }, [effectiveTaskId, bottomStartIndex]);

  // Keyboard navigation for scrolling when focused
  useInput(
    (input, key) => {
      if (!isFocused || logs.length === 0) return;

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
      <Box justifyContent="space-between" width="100%" marginBottom={1}>
        <Box gap={1} flexShrink={1}>
          <Text bold color={isFocused ? 'cyan' : 'gray'}>
            {isFocused ? '● ' : '  '}{title || `Logs: ${effectiveTaskId ?? 'No Task'}`}
          </Text>
          <Text dimColor>({totalLines} lines)</Text>
        </Box>

        <Box gap={1} flexShrink={0} paddingLeft={1}>
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
            <Text key={scrollStartIndex + idx} wrap="truncate-end">
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
};
