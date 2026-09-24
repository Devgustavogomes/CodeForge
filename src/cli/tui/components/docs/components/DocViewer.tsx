import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { DocItemInfo } from './DocsList.js';
import { MarkdownView } from '../../common/MarkdownView.js';
import { useTerminalDimensions } from '../../../hooks/useTerminalDimensions.js';
import { translate } from '../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../config/types.js';
import { theme } from '../../../theme.js';

export interface DocViewerProps {
  selectedDoc: DocItemInfo | null;
  width?: string | number;
  previewContent?: string | null;
  language?: SupportedLanguage;
}

export const DocViewer: React.FC<DocViewerProps> = memo(({
  selectedDoc,
  width = '100%',
  previewContent,
  language = 'en',
}) => {
  const { rows } = useTerminalDimensions();
  const maxPreviewLines = rows < 22 ? 2 : 3;

  const docTitle = selectedDoc
    ? `${selectedDoc.name}.md`
    : translate('tui_docs_details_none', language);

  const formattedDate =
    selectedDoc?.createdAt && selectedDoc.createdAt !== 'N/A'
      ? selectedDoc.createdAt.includes('T')
        ? selectedDoc.createdAt.split('T')[0]
        : selectedDoc.createdAt
      : null;

  const filteredPreview = useMemo(() => {
    if (!previewContent) return null;
    const meaningfulLines = previewContent
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);
    return meaningfulLines.length > 0 ? meaningfulLines.join('\n') : null;
  }, [previewContent]);

  const linkedIntents = selectedDoc?.intents ?? selectedDoc?.intents ?? [];

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={1}
    >
      <Box marginBottom={0}>
        <Text bold color={theme.colors.primary}>
          {translate('tui_docs_details_title', language, { name: docTitle })}
        </Text>
      </Box>

      {selectedDoc ? (
        <Box flexDirection="column">
          <Box marginBottom={0}>
            <Text bold>{translate('tui_docs_label_name', language)} </Text>
            <Text color={theme.colors.primary} bold wrap="truncate-end">
              {selectedDoc.name}
            </Text>
          </Box>
          <Box marginBottom={0}>
            <Text bold>{translate('tui_docs_label_path', language)} </Text>
            <Text color={theme.colors.muted} wrap="truncate-end">
              {selectedDoc.path}
            </Text>
          </Box>
          <Box marginBottom={0}>
            <Text bold>{translate('tui_docs_label_status', language)} </Text>
            <Text color={selectedDoc.inManifest ? theme.colors.success : theme.colors.warning}>
              {translate(
                selectedDoc.inManifest ? 'tui_badge_tracked' : 'tui_badge_untracked',
                language
              )}
            </Text>
            {formattedDate && (
              <Box marginLeft={2}>
                <Text bold>{translate('tui_docs_label_created', language)} </Text>
                <Text color={theme.colors.muted} wrap="truncate-end">
                  {formattedDate}
                </Text>
              </Box>
            )}
          </Box>

          <Box marginBottom={0}>
            <Text bold>{translate('tui_docs_label_intents', language)} </Text>
            <Text color={theme.colors.muted} wrap="truncate-end">
              {linkedIntents.length === 0
                ? translate('tui_docs_none_linked', language)
                : linkedIntents.join(', ')}
            </Text>
          </Box>

          <Box marginBottom={0}>
            <Text bold>{translate('tui_docs_label_scope', language)} </Text>
            <Text color={theme.colors.primary} wrap="truncate-end">
              {selectedDoc.scope.length === 0
                ? translate('tui_docs_all_changes', language)
                : selectedDoc.scope.join(', ')}
            </Text>
          </Box>

          {filteredPreview && rows >= 16 && (
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={theme.colors.borderSubtle} paddingX={1}>
              <Text bold color={theme.colors.primary}>{translate('tui_docs_label_preview', language)}</Text>
              <MarkdownView content={filteredPreview} maxLines={maxPreviewLines} truncate={true} />
            </Box>
          )}

          <Box
            marginTop={filteredPreview && rows >= 16 ? 1 : 0}
            borderStyle="single"
            borderColor={theme.colors.borderSubtle}
            paddingX={1}
            justifyContent="center"
          >
            <Text color={theme.colors.muted} wrap="truncate-end">
              {translate('tui_docs_viewer_shortcuts', language)}
            </Text>
          </Box>
        </Box>
      ) : (
        <Box paddingY={2} justifyContent="center">
          <Text color={theme.colors.muted}>
            {translate('tui_docs_viewer_empty', language)}
          </Text>
        </Box>
      )}
    </Box>
  );
});

DocViewer.displayName = 'DocViewer';

export default DocViewer;
