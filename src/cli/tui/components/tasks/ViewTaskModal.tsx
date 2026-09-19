import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { TaskScreenItem, STATUS_ICONS } from './components/TaskTree.js';
import { formatTaskToMarkdown } from './utils/taskFormatter.js';
import { MarkdownView } from '../common/MarkdownView.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { theme } from '../../theme.js';

export interface ViewTaskModalProps {
  task: TaskScreenItem | null;
  intentName?: string;
  currentIntent?: string;
  isOpen?: boolean;
  onClose: () => void;
  maxVisibleLines?: number;
  width?: string | number;
}

export const ViewTaskModal: React.FC<ViewTaskModalProps> = ({
  task,
  intentName: propIntentName,
  currentIntent,
  isOpen = true,
  onClose,
  maxVisibleLines: propMaxVisibleLines,
  width = '100%',
}) => {
  const intentName = propIntentName ?? currentIntent;
  const { rows } = useTerminalDimensions();
  const maxVisibleLines = propMaxVisibleLines ?? Math.max(5, rows - 9);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'markdown' | 'json'>('markdown');

  const content = useMemo(() => {
    if (!task) return '';
    return viewMode === 'markdown'
      ? formatTaskToMarkdown(task, intentName)
      : JSON.stringify(task, null, 2);
  }, [task, viewMode, intentName]);

  const contentLines = useMemo(() => {
    if (!content) return [];
    return content.split(/\r?\n/);
  }, [content]);

  const totalLines = contentLines.length;
  const maxScroll = Math.max(0, totalLines - maxVisibleLines);
  const pageSize = Math.max(1, Math.floor(maxVisibleLines / 2));

  const handleScrollUp = useCallback((delta = 1) => {
    setScrollOffset((prev) => Math.max(0, prev - delta));
  }, []);

  const handleScrollDown = useCallback((delta = 1) => {
    setScrollOffset((prev) => Math.min(maxScroll, prev + delta));
  }, [maxScroll]);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'markdown' ? 'json' : 'markdown'));
    setScrollOffset(0);
  }, []);

  useInput(
    (input, key) => {
      if (!isOpen) return;

      // Fechar: Esc, q ou Q (chama onClose)
      if (key.escape || input === '\u001B' || input === 'q' || input === 'Q') {
        onClose();
        return;
      }

      // Alternar modo: tecla v ou J (alterna viewMode e reseta scrollOffset para 0)
      if (input === 'v' || input === 'V' || input === 'J') {
        toggleViewMode();
        return;
      }

      // Topo: tecla g (scrollOffset = 0)
      if (input === 'g') {
        setScrollOffset(0);
        return;
      }

      // Fim: tecla G (scrollOffset = maxScroll)
      if (input === 'G') {
        setScrollOffset(maxScroll);
        return;
      }

      // Rolar 1 linha: setas ↑/↓ e teclas k/j
      if (key.upArrow || input === 'k') {
        handleScrollUp(1);
        return;
      }

      if (key.downArrow || input === 'j') {
        handleScrollDown(1);
        return;
      }

      // Rolar meia página: u/d e PageUp/PageDown
      if (key.pageUp || input === 'u') {
        handleScrollUp(pageSize);
        return;
      }

      if (key.pageDown || input === 'd') {
        handleScrollDown(pageSize);
        return;
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen || !task) return null;

  const statusInfo = STATUS_ICONS[task.status] ?? {
    icon: '○',
    color: theme.colors.muted,
    label: `[${(task.status || 'pending').toUpperCase()}]`,
  };

  const lineRangeStart = totalLines > 0 ? scrollOffset + 1 : 0;
  const lineRangeEnd = Math.min(totalLines, scrollOffset + maxVisibleLines);

  const posLabel =
    maxScroll === 0 || scrollOffset === 0
      ? '[TOP]'
      : scrollOffset >= maxScroll
      ? '[BOTTOM]'
      : `${Math.round((scrollOffset / maxScroll) * 100)}%`;

  const titleDisplay = task.title?.startsWith(task.id)
    ? task.title
    : `${task.id}: ${task.title}`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={2}
      paddingY={0}
      width={width}
    >
      {/* Cabeçalho */}
      <Box justifyContent="space-between" width="100%" marginBottom={intentName ? 0 : 1}>
        <Box gap={1} flexShrink={1}>
          <Text bold color={theme.colors.primary}>
            {titleDisplay}
          </Text>
          <Text color={statusInfo.color} bold>
            {statusInfo.icon} {statusInfo.label}
          </Text>
        </Box>
        <Text bold color={theme.colors.error}>
          [Esc / q] Fechar
        </Text>
      </Box>

      {/* Caminho / Intent */}
      {intentName && (
        <Box justifyContent="space-between" width="100%" marginBottom={1}>
          <Text color={theme.colors.muted} wrap="truncate-end">
            Intent: {intentName}
          </Text>
        </Box>
      )}

      {/* Corpo com MarkdownView */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        paddingY={0}
        minHeight={Math.min(maxVisibleLines, Math.max(3, totalLines))}
      >
        <MarkdownView
          content={content}
          scrollOffset={scrollOffset}
          maxLines={maxVisibleLines}
        />
      </Box>

      {/* Rodapé */}
      <Box flexDirection="column" width="100%" marginTop={1}>
        <Box justifyContent="space-between" width="100%">
          <Text color={theme.colors.muted}>
            [↑/↓ ou j/k] Rolar · [u/d] Meia pág · [g/G] Topo/Fim · [v] JSON/Formatado
          </Text>
          <Text color={theme.colors.primary}>
            {posLabel}
          </Text>
        </Box>
        <Box justifyContent="flex-end" width="100%">
          <Text color={theme.colors.muted}>
            Linhas {lineRangeStart}-{lineRangeEnd} de {totalLines}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default ViewTaskModal;
