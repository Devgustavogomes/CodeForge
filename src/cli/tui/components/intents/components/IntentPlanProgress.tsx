import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../../common/Spinner.js';
import { TimerView } from '../../common/TimerView.js';
import { theme } from '../../../theme.js';

export interface PlanGenerationResult {
  kind: 'valid' | 'invalid' | 'failed' | 'not-initialized' | 'intent-not-found' | 'intent-not-found' | 'tasks-dir-not-found' | 'error' | string;
  taskCount?: number;
  errors?: string[];
  message?: string;
}

export interface IntentPlanProgressProps {
  intentName?: string;  isGenerating: boolean;
  startTime?: number | Date | string | null;
  endTime?: number | Date | string | null;
  result?: PlanGenerationResult | null;
}

export const IntentPlanProgress: React.FC<IntentPlanProgressProps> = memo(({
  intentName: propIntentName,
  isGenerating,
  startTime,
  endTime,
  result,
}) => {
  const intentName = propIntentName;

  if (!isGenerating && !result) {
    return null;
  }

  if (isGenerating) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.warning}
        paddingX={1}
        marginY={1}
        width="100%"
      >
        <Box marginBottom={0}>
          <Text bold color={theme.colors.warning}>
            Gerando Plano de Execução [{intentName || 'intent'}]
          </Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Box gap={1}>
            <Spinner color={theme.colors.warning} />
            <Text>Planejando com agente de IA...</Text>
          </Box>
          <TimerView
            startTime={startTime}
            isRunning={true}
            prefix="Decorrido: "
            color={theme.colors.warning}
          />
        </Box>
      </Box>
    );
  }

  if (result?.kind === 'valid') {
    const taskCount = result.taskCount ?? 0;
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.success}
        paddingX={1}
        marginY={1}
        width="100%"
      >
        <Box marginBottom={0}>
          <Text bold color={theme.colors.success}>
            ✓ Plano Gerado com Sucesso
          </Text>
        </Box>
        <Box>
          <Text>
            Concluído em{' '}
            <TimerView
              startTime={startTime}
              endTime={endTime}
              isRunning={false}
            />
            {` • ${taskCount} tarefas criadas e validadas`}
          </Text>
        </Box>
      </Box>
    );
  }

  // Error or invalid plan
  const errors = result?.errors || [];
  const message =
    result?.message ||
    (result?.kind === 'invalid'
      ? 'O plano gerado possui erros de validação.'
      : `Falha na geração do plano: ${result?.kind}`);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.error}
      paddingX={1}
      marginY={1}
      width="100%"
    >
      <Box marginBottom={0}>
        <Text bold color={theme.colors.error}>
          ✗ Falha no Planejamento
        </Text>
      </Box>
      {message && (
        <Box marginY={0}>
          <Text color={theme.colors.error} bold wrap="truncate-end">
            {message}
          </Text>
        </Box>
      )}
      {errors.length > 0 && (
        <Box flexDirection="column" marginY={0}>
          <Text color={theme.colors.error} bold>
            Erros ({errors.length}):
          </Text>
          {errors.slice(0, 3).map((err, i) => (
            <Text key={i} color={theme.colors.error} dimColor wrap="truncate-end">
              • {err}
            </Text>
          ))}
          {errors.length > 3 && (
            <Text dimColor>...e mais {errors.length - 3} erros</Text>
          )}
        </Box>
      )}
    </Box>
  );
});

IntentPlanProgress.displayName = 'IntentPlanProgress';export default IntentPlanProgress;
