import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppContainer } from '../../../../../infrastructure/container.js';
import { theme } from '../../../theme.js';

export interface EnvironmentStepProps {
  container: AppContainer;
  environment?: string;
  selectedEnvironment?: string;
  onChange?: (environment: string) => void;
  onEnvironmentChange?: (environment: string) => void;
  onSelect?: (environment: string) => void;
  onConfirm?: (environment: string) => void;
  onNext?: () => void;
  isInteractive?: boolean;
}

export interface EnvironmentInfo {
  description: string;
  requirements: string;
  advantages: string;
}

/**
 * A infraestrutura expõe somente os identificadores dos runners. O cartão evita
 * inferir capacidades específicas e descreve o contrato comum a qualquer runner.
 */
export function createEnvironmentInfo(environment: string): EnvironmentInfo {
  return {
    description: `O runner “${environment}” executa as ações dos agentes no contexto fornecido pela infraestrutura.`,
    requirements: `O runner “${environment}” deve estar disponível e configurado neste projeto ou sistema.`,
    advantages: 'Centraliza a execução de comandos e mantém o fluxo dos agentes separado da interface do CodeForge.',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const EnvironmentStep: React.FC<EnvironmentStepProps> = ({
  container,
  environment,
  selectedEnvironment,
  onChange,
  onEnvironmentChange,
  onSelect,
  onConfirm,
  onNext,
  isInteractive = true,
}) => {
  const currentEnvironment = selectedEnvironment ?? environment ?? '';
  const environmentResult = useMemo<{
    environments: string[];
    error: string | undefined;
  }>(() => {
    try {
      return {
        environments:
          container.configureEnvironmentUseCase.getAvailableEnvironments() ?? [],
        error: undefined,
      };
    } catch (error: unknown) {
      return { environments: [], error: errorMessage(error) };
    }
  }, [container]);

  const { environments, error } = environmentResult;
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const initialIndex = environments.indexOf(currentEnvironment);
    return initialIndex >= 0 ? initialIndex : 0;
  });

  useEffect(() => {
    const storedIndex = environments.indexOf(currentEnvironment);
    setSelectedIndex((previous) => {
      if (storedIndex >= 0) return storedIndex;
      return Math.min(previous, Math.max(environments.length - 1, 0));
    });
  }, [currentEnvironment, environments]);

  useInput(
    (_input, key) => {
      if (environments.length === 0) return;

      if (key.upArrow) {
        setSelectedIndex((index) =>
          (index - 1 + environments.length) % environments.length,
        );
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((index) => (index + 1) % environments.length);
        return;
      }

      if (key.return) {
        const selected = environments[selectedIndex];
        if (!selected) return;
        onChange?.(selected);
        onEnvironmentChange?.(selected);
        onSelect?.(selected);
        onConfirm?.(selected);
        onNext?.();
      }
    },
    { isActive: isInteractive },
  );

  const selected = environments[selectedIndex];
  const info = selected ? createEnvironmentInfo(selected) : undefined;

  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box flexDirection="column">
        <Text bold color={theme.colors.primary}>Ambiente de execução</Text>
        <Text color={theme.colors.text}>
          O runner define onde os agentes executarão comandos, instalarão dependências e modificarão arquivos.
        </Text>
        <Text color={theme.colors.muted}>
          O nível de isolamento e os recursos disponíveis dependem do runner selecionado.
        </Text>
      </Box>

      {error ? (
        <Box borderStyle="round" borderColor={theme.colors.error} paddingX={1}>
          <Text color={theme.colors.error}>Não foi possível carregar os ambientes: {error}</Text>
        </Box>
      ) : environments.length === 0 ? (
        <Box borderStyle="round" borderColor={theme.colors.warning} paddingX={1}>
          <Text color={theme.colors.warning}>Nenhum ambiente foi disponibilizado pela infraestrutura.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold color={theme.colors.text}>Escolha um runner</Text>
          {environments.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={`${item}-${index}`} gap={1}>
                <Text color={isSelected ? theme.colors.primary : theme.colors.muted} bold={isSelected}>
                  {isSelected ? '›' : ' '}
                </Text>
                <Text color={isSelected ? theme.colors.primary : theme.colors.text} bold={isSelected}>
                  {item}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {selected && info ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.colors.borderActive}
          paddingX={1}
        >
          <Text bold color={theme.colors.accent}>{selected}</Text>
          <Text><Text bold>Descrição: </Text>{info.description}</Text>
          <Text><Text bold color={theme.colors.warning}>Requisitos: </Text>{info.requirements}</Text>
          <Text><Text bold color={theme.colors.success}>Vantagens: </Text>{info.advantages}</Text>
        </Box>
      ) : null}

      <Text color={theme.colors.muted}>[↑/↓] Navegar  [Enter] Confirmar ambiente</Text>
    </Box>
  );
};

export default EnvironmentStep;
