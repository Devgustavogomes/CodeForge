import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { DocsManifestEntry } from '../../../../../domain/doc.js';

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
}

export const DocsList: React.FC<DocsListProps> = memo(({
  docs,
  selectedIndex,
  width = '100%',
  maxVisibleDocs = 6,
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
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          Docs ({docs.length})
        </Text>
        <Text dimColor>[c] Create · [u] Update</Text>
      </Box>

      {docs.length === 0 ? (
        <Box
          paddingY={2}
          justifyContent="center"
          flexDirection="column"
          alignItems="center"
        >
          <Text dimColor>No documentation files found in .codeforge/docs/</Text>
          <Text dimColor>Press 'c' to create a new documentation file.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleDocs.map((doc) => {
            const isSelected = doc.name === selectedDoc?.name;
            return (
              <Box key={doc.name} justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                    {isSelected ? '❯' : ' '}
                  </Text>
                  <Text
                    bold={isSelected}
                    color={isSelected ? 'cyan' : 'white'}
                    wrap="truncate-end"
                  >
                    {doc.name}.md
                  </Text>
                </Box>
                <Text color={doc.inManifest ? 'green' : 'gray'}>
                  {doc.inManifest ? '[TRACKED]' : '[UNTRACKED]'}
                </Text>
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
