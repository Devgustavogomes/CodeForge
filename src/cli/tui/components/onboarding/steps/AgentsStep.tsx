import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppContainer } from '../../../../../infrastructure/container.js';
import { Spinner } from '../../common/Spinner.js';
import { TextInput } from '../../common/TextInput.js';
import { theme } from '../../../theme.js';

type AgentRole = 'planner' | 'executor';

export interface AgentsStepProps {
  container: AppContainer;
  environment: string;
  plannerAgent?: string;
  executorAgent?: string;
  onChange?: (plannerAgent: string, executorAgent: string) => void;
  onPlannerAgentChange?: (agent: string) => void;
  onExecutorAgentChange?: (agent: string) => void;
  onAgentsChange?: (plannerAgent: string, executorAgent: string) => void;
  onConfirm?: (plannerAgent: string, executorAgent: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onFormActiveChange?: (isActive: boolean) => void;
  isInteractive?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeAgent(value: string | undefined): string {
  return value?.trim() || 'default';
}

export const AgentsStep: React.FC<AgentsStepProps> = ({
  container,
  environment,
  plannerAgent,
  executorAgent,
  onChange,
  onPlannerAgentChange,
  onExecutorAgentChange,
  onAgentsChange,
  onConfirm,
  onNext,
  onBack,
  onFormActiveChange,
  isInteractive = true,
}) => {
  const [agents, setAgents] = useState<string[]>([]);
  const [resolvedEnvironment, setResolvedEnvironment] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);
  const [activeRole, setActiveRole] = useState<AgentRole>('planner');
  const [plannerIndex, setPlannerIndex] = useState(0);
  const [executorIndex, setExecutorIndex] = useState(0);
  const [manualPlanner, setManualPlanner] = useState(() => normalizeAgent(plannerAgent));
  const [manualExecutor, setManualExecutor] = useState(() => normalizeAgent(executorAgent));
  const [focusedField, setFocusedField] = useState<AgentRole>('planner');

  useEffect(() => {
    setManualPlanner(normalizeAgent(plannerAgent));
  }, [plannerAgent]);

  useEffect(() => {
    setManualExecutor(normalizeAgent(executorAgent));
  }, [executorAgent]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(undefined);
    setActiveRole('planner');

    Promise.resolve()
      .then(() =>
        container.configureEnvironmentUseCase.getAgentsForEnvironment(environment),
      )
      .then((availableAgents) => {
        if (!active) return;
        const uniqueAgents = Array.from(
          new Set((availableAgents ?? []).filter((agent) => Boolean(agent))),
        );
        setAgents(uniqueAgents);
        setResolvedEnvironment(environment);
        const savedPlannerIndex = uniqueAgents.indexOf(normalizeAgent(plannerAgent));
        const savedExecutorIndex = uniqueAgents.indexOf(normalizeAgent(executorAgent));
        setPlannerIndex(savedPlannerIndex >= 0 ? savedPlannerIndex : 0);
        setExecutorIndex(savedExecutorIndex >= 0 ? savedExecutorIndex : 0);
        setIsLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(errorMessage(reason));
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [container, environment, retryCount]);

  const hasCurrentResult = resolvedEnvironment === environment;
  const isManualMode = !isLoading && !error && hasCurrentResult && agents.length === 0;

  useEffect(() => {
    onFormActiveChange?.(isManualMode);
    return () => onFormActiveChange?.(false);
  }, [isManualMode, onFormActiveChange]);

  const commitAgents = useCallback((planner: string, executor: string) => {
    const nextPlanner = normalizeAgent(planner);
    const nextExecutor = normalizeAgent(executor);
    onPlannerAgentChange?.(nextPlanner);
    onExecutorAgentChange?.(nextExecutor);
    onChange?.(nextPlanner, nextExecutor);
    onAgentsChange?.(nextPlanner, nextExecutor);
    onConfirm?.(nextPlanner, nextExecutor);
    onNext?.();
  }, [onAgentsChange, onChange, onConfirm, onExecutorAgentChange, onNext, onPlannerAgentChange]);

  useInput(
    (input, key) => {
      if (isLoading) return;

      if (error) {
        if (input.toLowerCase() === 'r') setRetryCount((count) => count + 1);
        return;
      }

      if (!hasCurrentResult) return;

      if (agents.length > 0) {
        const setIndex = activeRole === 'planner' ? setPlannerIndex : setExecutorIndex;
        if (key.upArrow) {
          setIndex((index) => (index - 1 + agents.length) % agents.length);
          return;
        }
        if (key.downArrow) {
          setIndex((index) => (index + 1) % agents.length);
          return;
        }
        if (key.escape && activeRole === 'executor') {
          setActiveRole('planner');
          return;
        }
        if (key.return) {
          if (activeRole === 'planner') {
            const selectedPlanner = agents[plannerIndex];
            if (selectedPlanner) onPlannerAgentChange?.(selectedPlanner);
            setActiveRole('executor');
            return;
          }
          commitAgents(agents[plannerIndex], agents[executorIndex]);
        }
        return;
      }

      if (key.upArrow || key.downArrow || key.tab) {
        setFocusedField((field) => field === 'planner' ? 'executor' : 'planner');
        return;
      }
      if (key.escape) {
        onPlannerAgentChange?.(normalizeAgent(manualPlanner));
        onExecutorAgentChange?.(normalizeAgent(manualExecutor));
        onAgentsChange?.(
          normalizeAgent(manualPlanner),
          normalizeAgent(manualExecutor),
        );
        onChange?.(
          normalizeAgent(manualPlanner),
          normalizeAgent(manualExecutor),
        );
        onBack?.();
        return;
      }
      if (key.return) {
        if (focusedField === 'planner') {
          onPlannerAgentChange?.(normalizeAgent(manualPlanner));
          setFocusedField('executor');
        } else {
          commitAgents(manualPlanner, manualExecutor);
        }
        return;
      }

      const setValue = focusedField === 'planner' ? setManualPlanner : setManualExecutor;
      const currentValue = focusedField === 'planner' ? manualPlanner : manualExecutor;

      if (key.backspace || key.delete || input === '\x08' || input === '\x7f') {
        const nextValue = currentValue.slice(0, -1);
        setValue(nextValue);
        return;
      }
      if (key.ctrl && input === 'u') {
        setValue('');
        return;
      }
      if (!key.ctrl && !key.meta) {
        const printable = input
          .split('')
          .filter((character) => {
            const code = character.charCodeAt(0);
            return (code >= 32 && code !== 127) || code > 127;
          })
          .join('');
        if (printable) {
          const nextValue = currentValue + printable;
          setValue(nextValue);
        }
      }
    },
    { isActive: isInteractive },
  );

  const renderAgentList = (role: AgentRole, selectedIndex: number) => {
    const isActive = activeRole === role;
    return (
      <Box
        flexDirection="column"
        width="50%"
        borderStyle="round"
        borderColor={isActive ? theme.colors.borderActive : theme.colors.borderSubtle}
        paddingX={1}
      >
        <Text bold color={isActive ? theme.colors.primary : theme.colors.text}>
          {role === 'planner' ? '1. Planner' : '2. Executor'}
        </Text>
        {agents.map((agent, index) => (
          <Text
            key={`${role}-${agent}-${index}`}
            color={index === selectedIndex ? theme.colors.primary : theme.colors.muted}
            bold={index === selectedIndex}
          >
            {index === selectedIndex ? '› ' : '  '}{agent}
          </Text>
        ))}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box flexDirection="column">
        <Text bold color={theme.colors.primary}>Agentes de IA</Text>
        <Text><Text bold color={theme.colors.accent}>Planner: </Text>analisa a especificação, define a arquitetura e decompõe o trabalho em tarefas atômicas.</Text>
        <Text><Text bold color={theme.colors.success}>Executor: </Text>implementa cada tarefa, usa ferramentas, executa testes e corrige erros.</Text>
        <Text color={theme.colors.muted}>Introspecção do runner confirmado: {environment}</Text>
      </Box>

      {isLoading ? (
        <Spinner label={`Consultando agentes disponíveis em ${environment}...`} />
      ) : error ? (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.error} paddingX={1}>
          <Text color={theme.colors.error}>Falha ao consultar os agentes: {error}</Text>
          <Text color={theme.colors.muted}>
            Escolhas preservadas: Planner {normalizeAgent(plannerAgent)} · Executor {normalizeAgent(executorAgent)}
          </Text>
          <Text color={theme.colors.warning}>[r] Tentar introspecção novamente</Text>
        </Box>
      ) : agents.length > 0 ? (
        <>
          <Box gap={1} width="100%">
            {renderAgentList('planner', plannerIndex)}
            {renderAgentList('executor', executorIndex)}
          </Box>
          <Text color={theme.colors.muted}>
            [↑/↓] Navegar  [Enter] Confirmar {activeRole === 'planner' ? 'Planner' : 'Executor'}
          </Text>
        </>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text color={theme.colors.warning}>
            O runner não informou agentes. Digite os identificadores manualmente.
          </Text>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={focusedField === 'planner' ? theme.colors.borderActive : theme.colors.borderSubtle}
            paddingX={1}
          >
            <Text bold color={focusedField === 'planner' ? theme.colors.primary : theme.colors.text}>Planner</Text>
            <TextInput value={manualPlanner} placeholder="default" isFocused={focusedField === 'planner'} />
          </Box>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={focusedField === 'executor' ? theme.colors.borderActive : theme.colors.borderSubtle}
            paddingX={1}
          >
            <Text bold color={focusedField === 'executor' ? theme.colors.primary : theme.colors.text}>Executor</Text>
            <TextInput value={manualExecutor} placeholder="default" isFocused={focusedField === 'executor'} />
          </Box>
          <Text color={theme.colors.muted}>[↑/↓/Tab] Alterar campo  [Enter] Confirmar  [Esc] Voltar</Text>
        </Box>
      )}
    </Box>
  );
};

export default AgentsStep;
