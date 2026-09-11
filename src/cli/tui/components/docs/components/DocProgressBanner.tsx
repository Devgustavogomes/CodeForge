import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../../common/Spinner.js';
import { TimerView } from '../../common/TimerView.js';

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
}

export const DocProgressBanner: React.FC<DocProgressBannerProps> = memo(({
  isGenerating = false,
  operation = 'update',
  docName = 'doc',
  batchInfo,
  startTime,
  elapsedFormatted: _elapsedFormatted,
  feedback,
}) => {
  if (isGenerating) {
    const actionLabel = operation === 'create' ? 'Criando' : 'Atualizando';

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
            {`📝 ${actionLabel} Documentação: ${displayDoc}`}
          </Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Box gap={1}>
            <Spinner color="cyan" />
            <Text color="yellow">Gerando conteúdo técnico via use-case...</Text>
          </Box>
          <TimerView
            startTime={startTime}
            isRunning={true}
            prefix="⏱ Decorrido: "
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
