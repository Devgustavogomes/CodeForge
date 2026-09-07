import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../../common/Spinner.js';
import { TimerView } from '../../common/TimerView.js';

export interface PlanGenerationResult {
  kind: 'valid' | 'invalid' | 'failed' | 'not-initialized' | 'spec-not-found' | 'tasks-dir-not-found' | 'error' | string;
  taskCount?: number;
  errors?: string[];
  message?: string;
}

export interface SpecPlanProgressProps {
  specName?: string;
  isGenerating: boolean;
  startTime?: number | Date | string | null;
  endTime?: number | Date | string | null;
  result?: PlanGenerationResult | null;
}

export const SpecPlanProgress: React.FC<SpecPlanProgressProps> = memo(({
  specName,
  isGenerating,
  startTime,
  endTime,
  result,
}) => {
  if (!isGenerating && !result) {
    return null;
  }

  if (isGenerating) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        marginY={1}
        width="100%"
      >
        <Box marginBottom={0}>
          <Text bold color="yellow">
            ⚡ Gerando Plano de Execução [{specName || 'spec'}]
          </Text>
        </Box>
        <Box justifyContent="space-between" width="100%">
          <Box gap={1}>
            <Spinner color="yellow" />
            <Text>Planejando com agente de IA...</Text>
          </Box>
          <TimerView
            startTime={startTime}
            isRunning={true}
            prefix="⏱ Decorrido: "
            color="yellow"
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
        borderColor="green"
        paddingX={1}
        marginY={1}
        width="100%"
      >
        <Box marginBottom={0}>
          <Text bold color="green">
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
      borderColor="red"
      paddingX={1}
      marginY={1}
      width="100%"
    >
      <Box marginBottom={0}>
        <Text bold color="red">
          ✗ Falha no Planejamento
        </Text>
      </Box>
      {message && (
        <Box marginY={0}>
          <Text color="red" bold wrap="truncate-end">
            {message}
          </Text>
        </Box>
      )}
      {errors.length > 0 && (
        <Box flexDirection="column" marginY={0}>
          <Text color="red" bold>
            Erros ({errors.length}):
          </Text>
          {errors.slice(0, 3).map((err, i) => (
            <Text key={i} color="red" dimColor wrap="truncate-end">
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

SpecPlanProgress.displayName = 'SpecPlanProgress';
export default SpecPlanProgress;
