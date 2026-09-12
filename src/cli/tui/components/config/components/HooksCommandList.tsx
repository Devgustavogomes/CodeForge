import React from 'react';
import { Box, Text } from 'ink';
import { HookEvent, HookDefinition } from '../../../../../domain/hook.js';
import { EVENT_DESCRIPTIONS } from './HooksEventList.js';
import { theme } from '../../../theme.js';

export interface HooksCommandListProps {
  event: HookEvent;
  commands: HookDefinition[];
  selectedIndex: number;
  deleteConfirmIndex?: number | null;
  isDeleting?: boolean;
}

/**
 * Nível 2 - Lista de Comandos configurados para um Evento específico.
 * Permite adicionar novo comando, visualizar comandos existentes com badges de tipo,
 * editar comandos e confirmar exclusão.
 */
export const HooksCommandList: React.FC<HooksCommandListProps> = ({
  event,
  commands,
  selectedIndex,
  deleteConfirmIndex,
  isDeleting,
}) => {
  const isAnyConfirming =
    isDeleting === true ||
    (deleteConfirmIndex !== null && deleteConfirmIndex !== undefined);

  let confirmRendered = false;

  return (
    <Box flexDirection="column" width="100%">
      {/* Cabeçalho */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          Hooks do Evento: {event}
        </Text>
        <Text color={theme.colors.muted}>
          {EVENT_DESCRIPTIONS[event] ||
            'Gerencie os comandos executados para este evento.'}
        </Text>
      </Box>

      {/* Primeiro item selecionável: [+ Adicionar Novo Comando] */}
      <Box gap={1} alignItems="center" marginBottom={0}>
        <Text
          color={selectedIndex === 0 ? theme.colors.primary : theme.colors.muted}
          bold={selectedIndex === 0}
        >
          {selectedIndex === 0 ? '> ●' : '  ○'}
        </Text>
        <Text
          bold={selectedIndex === 0}
          color={selectedIndex === 0 ? theme.colors.primary : theme.colors.success}
        >
          [+ Adicionar Novo Comando]
        </Text>
      </Box>

      {/* Mensagem caso não haja comandos existentes */}
      {commands.length === 0 && (
        <Box paddingLeft={4} marginY={0}>
          <Text color={theme.colors.muted}>(Nenhum comando configurado para este evento)</Text>
        </Box>
      )}

      {/* Lista de Comandos Existentes */}
      {commands.map((cmd, idx) => {
        const itemIndex = idx + 1;
        const isSelected = selectedIndex === itemIndex;
        const isGate = cmd.type === 'gate';
        const isThisItemDeleting =
          isAnyConfirming &&
          (deleteConfirmIndex === idx ||
            deleteConfirmIndex === itemIndex ||
            (isDeleting && isSelected));

        if (isThisItemDeleting) {
          confirmRendered = true;
        }

        return (
          <Box key={`${cmd.name}-${idx}`} flexDirection="column" marginY={0}>
            <Box gap={1} alignItems="center">
              <Text color={isSelected ? theme.colors.primary : theme.colors.muted} bold={isSelected}>
                {isSelected ? '> ●' : '  ○'}
              </Text>
              <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
                {idx + 1}.
              </Text>
              <Box width={8}>
                <Text color={isGate ? theme.colors.warning : theme.colors.success} bold>
                  {isGate ? '[GATE]' : '[NOTIFY]'}
                </Text>
              </Box>
              <Box minWidth={14} flexShrink={0}>
                <Text
                  bold
                  color={isSelected ? theme.colors.primary : theme.colors.text}
                  wrap="truncate-end"
                >
                  {cmd.name}
                </Text>
              </Box>
              <Box flexShrink={1}>
                <Text color={theme.colors.muted} wrap="truncate-end">
                  {cmd.run}
                </Text>
              </Box>
            </Box>

            {isThisItemDeleting && (
              <Box paddingLeft={4} marginY={0}>
                <Text color={theme.colors.error} bold>
                  Excluir este comando? [y/N]
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Confirmação genérica se deleteConfirmIndex ativo mas não renderizado acima */}
      {isAnyConfirming && !confirmRendered && (
        <Box paddingLeft={4} marginY={0}>
          <Text color={theme.colors.error} bold>
            Excluir este comando? [y/N]
          </Text>
        </Box>
      )}

      {/* Barra de Atalhos */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        justifyContent="space-between"
        width="100%"
      >
        <Text color={theme.colors.muted}>[↑/↓] Navegar</Text>
        <Text color={theme.colors.muted}>[Enter] Selecionar/Editar</Text>
        <Text color={theme.colors.muted}>[e] Editar</Text>
        <Text color={theme.colors.muted}>[d] Excluir</Text>
        <Text color={theme.colors.muted}>[Esc ou ←] Voltar</Text>
      </Box>
    </Box>
  );
};
