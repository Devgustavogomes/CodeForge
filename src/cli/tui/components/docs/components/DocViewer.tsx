import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { DocItemInfo } from './DocsList.js';

export interface DocViewerProps {
  selectedDoc: DocItemInfo | null;
  width?: string | number;
  previewContent?: string | null;
}

export const DocViewer: React.FC<DocViewerProps> = memo(({
  selectedDoc,
  width = '100%',
  previewContent,
}) => {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="blue">
          Document Details: {selectedDoc ? `${selectedDoc.name}.md` : 'None'}
        </Text>
      </Box>

      {selectedDoc ? (
        <Box flexDirection="column">
          <Box marginBottom={0}>
            <Text bold>Name: </Text>
            <Text color="white" wrap="truncate-end">
              {selectedDoc.name}
            </Text>
          </Box>
          <Box marginBottom={0}>
            <Text bold>Path: </Text>
            <Text dimColor wrap="truncate-end">
              {selectedDoc.path}
            </Text>
          </Box>
          <Box marginBottom={0} justifyContent="space-between">
            <Box gap={1} flexShrink={1}>
              <Text bold>Status: </Text>
              <Text color={selectedDoc.inManifest ? 'green' : 'yellow'}>
                {selectedDoc.inManifest ? 'Tracked' : 'Untracked'}
              </Text>
            </Box>
            {selectedDoc.createdAt !== 'N/A' && (
              <Box gap={1} flexShrink={0} paddingLeft={1}>
                <Text bold>Created: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedDoc.createdAt}
                </Text>
              </Box>
            )}
          </Box>

          <Box marginBottom={0}>
            <Text bold>Associated Specs: </Text>
            <Text dimColor wrap="truncate-end">
              {selectedDoc.specs.length === 0
                ? 'None linked'
                : selectedDoc.specs.join(', ')}
            </Text>
          </Box>

          <Box marginBottom={0}>
            <Text bold>Tracked Scope: </Text>
            <Text color="cyan" wrap="truncate-end">
              {selectedDoc.scope.length === 0
                ? 'All codebase changes'
                : selectedDoc.scope.join(', ')}
            </Text>
          </Box>

          {previewContent && (
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
              <Text bold color="blue">Preview:</Text>
              <Text dimColor wrap="truncate-end">
                {previewContent.split('\n').slice(0, 4).join('\n')}
              </Text>
            </Box>
          )}

          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            justifyContent="space-between"
          >
            <Text dimColor>
              [u] Update from Codebase · [c] Create new Document
            </Text>
          </Box>
        </Box>
      ) : (
        <Box paddingY={2} justifyContent="center">
          <Text dimColor>
            Select a documentation file to view metadata and trigger updates.
          </Text>
        </Box>
      )}
    </Box>
  );
});

DocViewer.displayName = 'DocViewer';

export default DocViewer;
