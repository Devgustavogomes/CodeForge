import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { DocItemInfo } from './DocsScreen.js';
import { MarkdownView } from '../common/MarkdownView.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { translate } from '../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../config/types.js';
import { theme } from '../../theme.js';

export interface ViewDocModalProps {
  doc: DocItemInfo | null;
  content?: string | null;
  isOpen?: boolean;
  onClose: () => void;
  language?: SupportedLanguage;
  maxVisibleLines?: number;
  width?: string | number;
}

export const ViewDocModal: React.FC<ViewDocModalProps> = ({
  doc,
  content,
  isOpen = true,
  onClose,
  language = 'en',
  maxVisibleLines: propMaxVisibleLines,
  width = '100%',
}) => {
  const { rows } = useTerminalDimensions();
  const maxVisibleLines = propMaxVisibleLines ?? Math.max(5, Math.min(16, rows - 9));
  const [scrollOffset, setScrollOffset] = useState(0);

  const docLines = useMemo(() => {
    if (!content) return [];
    return content.split(/\r?\n/);
  }, [content]);

  const totalLines = docLines.length;
  const maxScroll = Math.max(0, totalLines - maxVisibleLines);
  const pageSize = Math.max(1, Math.floor(maxVisibleLines / 2));

  const handleScrollUp = useCallback((delta = 1) => {
    setScrollOffset((prev) => Math.max(0, prev - delta));
  }, []);

  const handleScrollDown = useCallback((delta = 1) => {
    setScrollOffset((prev) => Math.min(maxScroll, prev + delta));
  }, [maxScroll]);

  useInput(
    (input, key) => {
      if (!isOpen) return;

      // Close modal: Esc or 'q'
      if (key.escape || input === '\u001B' || input === 'q' || input === 'Q') {
        onClose();
        return;
      }

      // Scroll up: Up arrow, 'k'
      if (key.upArrow || input === 'k') {
        handleScrollUp(1);
        return;
      }

      // Scroll down: Down arrow, 'j'
      if (key.downArrow || input === 'j') {
        handleScrollDown(1);
        return;
      }

      // Page up / half page: 'u' or pageUp
      if (key.pageUp || input === 'u') {
        handleScrollUp(pageSize);
        return;
      }

      // Page down / half page: 'd' or pageDown
      if (key.pageDown || input === 'd') {
        handleScrollDown(pageSize);
        return;
      }

      // Home: top of document
      if (input === 'g') {
        setScrollOffset(0);
        return;
      }

      // End: bottom of document
      if (input === 'G') {
        setScrollOffset(maxScroll);
        return;
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen || !doc) return null;

  const docName = `${doc.name}.md`;
  const badgeKey = doc.inManifest ? 'tui_badge_tracked' : 'tui_badge_untracked';
  const badgeText = `[${translate(badgeKey, language).toUpperCase()}]`;

  const lineRangeStart = totalLines > 0 ? scrollOffset + 1 : 0;
  const lineRangeEnd = Math.min(totalLines, scrollOffset + maxVisibleLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={2}
      paddingY={0}
      width={width}
    >
      {/* Header Bar */}
      <Box justifyContent="space-between" width="100%" marginBottom={0}>
        <Box gap={1} flexShrink={1}>
          <Text bold color={theme.colors.primary}>
            {translate('tui_docs_view_title', language, { name: docName })}
          </Text>
          <Text color={doc.inManifest ? theme.colors.success : theme.colors.muted}>{badgeText}</Text>
        </Box>
        <Text bold color={theme.colors.error}>[Esc / q] {translate('tui_modal_close_hint', language)}</Text>
      </Box>

      {/* Meta Bar */}
      <Box justifyContent="space-between" width="100%" marginBottom={1}>
        <Text color={theme.colors.muted} wrap="truncate-end">
          {doc.path}
        </Text>
        {totalLines > 0 && (
          <Text color={theme.colors.muted}>
            {lineRangeStart}-{lineRangeEnd} / {totalLines} lines
          </Text>
        )}
      </Box>

      {/* Content View */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        paddingY={0}
        minHeight={Math.min(maxVisibleLines, Math.max(3, totalLines))}
      >
        {!content ? (
          <Box paddingY={2} justifyContent="center">
            <Text color={theme.colors.muted}>
              {translate('tui_docs_view_empty', language)}
            </Text>
          </Box>
        ) : (
          <MarkdownView
            content={content}
            scrollOffset={scrollOffset}
            maxLines={maxVisibleLines}
          />
        )}
      </Box>

      {/* Footer Navigation Bar */}
      <Box justifyContent="space-between" width="100%" marginTop={1}>
        <Text color={theme.colors.muted}>
          {translate('tui_docs_view_shortcuts', language)}
        </Text>
        {maxScroll > 0 && (
          <Text color={theme.colors.primary}>
            {scrollOffset === 0
              ? '[TOP]'
              : scrollOffset >= maxScroll
              ? '[BOTTOM]'
              : `${Math.round((scrollOffset / maxScroll) * 100)}%`}
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default ViewDocModal;
