import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../../common/Spinner.js';
import { TimerView } from '../../common/TimerView.js';
import { translate } from '../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../config/types.js';

export interface BatchInfo {
  current: number;
  total: number;
}

export interface DocProgressBannerProps {
  isGenerating?: boolean;
  operation?: 'create' | 'update';
  docName?: string;
  batchInfo?: BatchInfo | null;
  startTime?: string | number | Date | null;
  elapsedFormatted?: string;
  feedback?: {
    type: 'success' | 'error' | 'info';
    message: string;
    elapsed?: string;
  } | null;
  language?: SupportedLanguage;
}

export const DocProgressBanner: React.FC<DocProgressBannerProps> = memo(({
  isGenerating = false,
  operation = 'update',
  docName = 'doc',
  batchInfo,
  startTime,
  elapsedFormatted: _elapsedFormatted,
  feedback,
  language = 'en',
}) => {
  if (isGenerating) {
    const actionLabel = translate(
      operation === 'create'
        ? 'tui_docs_progress_action_create'
        : 'tui_docs_progress_action_update',
      language
    );

    let displayDoc = `[${docName}]`;
    if (docName.startsWith('[')) {
      displayDoc = docName;
    } else if (batchInfo) {
      displayDoc = `[${batchInfo.current}/${batchInfo.total}] ${docName}`;
    }

    return (
      <Box
        borderStyle="round"
        borderColor="cyan"
        flexDirection="column"
        paddingX={1}
        width="100%"
        marginBottom={1}
      >
        <Box marginBottom={0}>
          <Text bold color="cyan">
            {translate('tui_docs_progress_title', language, {
              action: actionLabel,
              doc: displayDoc,
            })}
          </Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Box gap={1}>
            <Spinner color="cyan" />
            <Text color="yellow">
              {translate('tui_docs_progress_generating', language)}
            </Text>
          </Box>
          <TimerView
            startTime={startTime}
            isRunning={true}
            prefix={translate('tui_docs_progress_elapsed', language)}
            color="cyan"
          />
        </Box>
      </Box>
    );
  }

  if (feedback) {
    const isSuccess = feedback.type === 'success';
    const isError = feedback.type === 'error';
    const borderColor = isSuccess ? 'green' : isError ? 'red' : 'yellow';

    return (
      <Box
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        width="100%"
        marginBottom={1}
      >
        <Text color={borderColor} bold wrap="truncate-end">
          {feedback.message}
        </Text>
      </Box>
    );
  }

  return null;
});

DocProgressBanner.displayName = 'DocProgressBanner';

export default DocProgressBanner;
