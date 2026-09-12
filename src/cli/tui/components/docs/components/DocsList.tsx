import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { DocsManifestEntry } from '../../../../../domain/doc.js';
import { translate } from '../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../config/types.js';

export interface DocItemInfo extends DocsManifestEntry {
  name: string;
  existsOnDisk: boolean;
  inManifest: boolean;
}

export interface DocsListProps {
  docs: DocItemInfo[];
  selectedIndex: number;
  width?: string | number;
  maxVisibleDocs?: number;
  language?: SupportedLanguage;
}

export const DocsList: React.FC<DocsListProps> = memo(({
  docs,
  selectedIndex,
  width = '100%',
  maxVisibleDocs = 6,
  language = 'en',
}) => {
  const visibleDocs = useMemo(() => {
    if (docs.length <= maxVisibleDocs) return docs;
    const selectedIdx = Math.max(0, selectedIndex);
    let start = Math.max(0, selectedIdx - Math.floor(maxVisibleDocs / 2));
    if (start + maxVisibleDocs > docs.length) {
      start = Math.max(0, docs.length - maxVisibleDocs);
    }
    return docs.slice(start, start + maxVisibleDocs);
  }, [docs, maxVisibleDocs, selectedIndex]);

  const selectedDoc = docs[selectedIndex] ?? null;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={0}>
        <Text bold color="cyan">
          {translate('tui_docs_list_title', language, { count: docs.length })}
        </Text>
        <Text dimColor wrap="truncate-end">{translate('tui_docs_list_shortcuts', language)}</Text>
      </Box>

      {docs.length === 0 ? (
        <Box
          paddingY={2}
          justifyContent="center"
          flexDirection="column"
          alignItems="center"
        >
          <Text dimColor>{translate('tui_docs_no_docs', language)}</Text>
          <Text dimColor>{translate('tui_docs_press_c', language)}</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleDocs.map((doc) => {
            const isSelected = doc.name === selectedDoc?.name;
            const badgeKey = doc.inManifest ? 'tui_badge_tracked' : 'tui_badge_untracked';
            const badgeText = `[${translate(badgeKey, language).toUpperCase()}]`;

            return (
              <Box key={doc.name} justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                    {isSelected ? '>' : ' '}
                  </Text>
                  <Text
                    bold={isSelected}
                    color={isSelected ? 'cyan' : 'white'}
                    wrap="truncate-end"
                  >
                    {doc.name}.md
                  </Text>
                </Box>
                <Box flexShrink={0}>
                  <Text color={doc.inManifest ? 'green' : 'gray'}>
                    {badgeText}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
});

DocsList.displayName = 'DocsList';

export default DocsList;
