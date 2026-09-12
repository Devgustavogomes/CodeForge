import React, { memo } from 'react';
import { Box, Text } from 'ink';

export interface MarkdownViewProps {
  content: string;
  scrollOffset?: number;
  maxLines?: number;
  width?: number | string;
  truncate?: boolean;
}

/**
 * Splits inline markdown text into styled segments (bold and inline code).
 */
function renderInline(text: string, keyPrefix: string, truncate = false): React.ReactNode {
  // Regex to match **bold** or `code`
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);
  const wrapProp = truncate ? ('truncate-end' as const) : undefined;

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <Text key={key} bold color="white" wrap={wrapProp}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <Text key={key} color="yellow" wrap={wrapProp}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return (
      <Text key={key} wrap={wrapProp}>
        {part}
      </Text>
    );
  });
}

export const MarkdownView: React.FC<MarkdownViewProps> = memo(({
  content,
  scrollOffset = 0,
  maxLines,
  width = '100%',
  truncate = false,
}) => {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, scrollOffset);
  const visibleLines = maxLines !== undefined ? lines.slice(start, start + maxLines) : lines.slice(start);

  const wrapProp = truncate ? ('truncate-end' as const) : undefined;

  // Determine state of code block at `start` to color lines correctly if scrolled
  let insideCodeBlock = false;
  for (let i = 0; i < start; i++) {
    if (lines[i]?.trim().startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
    }
  }

  return (
    <Box flexDirection="column" width={width}>
      {visibleLines.map((rawLine, idx) => {
        const lineIndex = start + idx;
        const line = rawLine;
        const trimmed = line.trim();

        // Code block toggle
        if (trimmed.startsWith('```')) {
          insideCodeBlock = !insideCodeBlock;
          const lang = trimmed.slice(3).trim();
          return (
            <Box key={`line-${lineIndex}`} marginY={0}>
              <Text dimColor color="cyan" wrap={wrapProp}>
                {insideCodeBlock ? `┌──[ code${lang ? `: ${lang}` : ''} ]` : '└──[ end ]'}
              </Text>
            </Box>
          );
        }

        // Inside code block
        if (insideCodeBlock) {
          return (
            <Box key={`line-${lineIndex}`} paddingLeft={1}>
              <Text dimColor wrap={wrapProp}>│ </Text>
              <Text color="cyan" wrap={wrapProp}>{line}</Text>
            </Box>
          );
        }

        // Empty line
        if (trimmed === '') {
          return (
            <Box key={`line-${lineIndex}`} height={1}>
              <Text> </Text>
            </Box>
          );
        }

        // Horizontal Rule: ---, ***, ___
        if (/^[-*_]{3,}$/.test(trimmed)) {
          return (
            <Box key={`line-${lineIndex}`} marginY={0}>
              <Text dimColor color="gray" wrap={wrapProp}>
                ──────────────────────────────────────────────────
              </Text>
            </Box>
          );
        }

        // Headings: #, ##, ###, ####
        if (trimmed.startsWith('# ')) {
          return (
            <Box key={`line-${lineIndex}`} marginTop={lineIndex > 0 ? 1 : 0} marginBottom={0}>
              <Text bold color="cyan" wrap={wrapProp}>
                # {trimmed.slice(2)}
              </Text>
            </Box>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <Box key={`line-${lineIndex}`} marginTop={lineIndex > 0 ? 1 : 0} marginBottom={0}>
              <Text bold color="white" wrap={wrapProp}>
                ## {trimmed.slice(3)}
              </Text>
            </Box>
          );
        }
        if (trimmed.startsWith('### ')) {
          return (
            <Box key={`line-${lineIndex}`} marginTop={0} marginBottom={0}>
              <Text bold color="yellow" wrap={wrapProp}>
                ### {trimmed.slice(4)}
              </Text>
            </Box>
          );
        }
        if (trimmed.startsWith('#### ')) {
          return (
            <Box key={`line-${lineIndex}`} marginTop={0} marginBottom={0}>
              <Text bold color="blue" wrap={wrapProp}>
                #### {trimmed.slice(5)}
              </Text>
            </Box>
          );
        }

        // Blockquotes: > quote
        if (trimmed.startsWith('>')) {
          const quoteText = trimmed.replace(/^>\s?/, '');
          return (
            <Box key={`line-${lineIndex}`} paddingLeft={1}>
              <Text color="gray" wrap={wrapProp}>│ </Text>
              <Text italic color="gray" wrap={wrapProp}>
                {renderInline(quoteText, `quote-${lineIndex}`, truncate)}
              </Text>
            </Box>
          );
        }

        // Unordered List: - item, * item
        if (/^[-*+]\s+/.test(trimmed)) {
          const listText = trimmed.replace(/^[-*+]\s+/, '');
          return (
            <Box key={`line-${lineIndex}`} paddingLeft={1}>
              <Text color="cyan" wrap={wrapProp}>• </Text>
              <Text wrap={wrapProp}>{renderInline(listText, `ul-${lineIndex}`, truncate)}</Text>
            </Box>
          );
        }

        // Ordered List: 1. item
        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
          const num = orderedMatch[1];
          const listText = orderedMatch[2] ?? '';
          return (
            <Box key={`line-${lineIndex}`} paddingLeft={1}>
              <Text color="cyan" wrap={wrapProp}>{num}. </Text>
              <Text wrap={wrapProp}>{renderInline(listText, `ol-${lineIndex}`, truncate)}</Text>
            </Box>
          );
        }

        // Standard paragraph line
        return (
          <Box key={`line-${lineIndex}`}>
            <Text wrap={wrapProp}>{renderInline(line, `p-${lineIndex}`, truncate)}</Text>
          </Box>
        );
      })}
    </Box>
  );
});

MarkdownView.displayName = 'MarkdownView';

export default MarkdownView;
