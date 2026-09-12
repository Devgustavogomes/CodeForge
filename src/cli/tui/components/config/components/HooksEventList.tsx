import React from 'react';
import { Box, Text } from 'ink';
import { HOOK_EVENTS, HookEvent, HookMap } from '../../../../../domain/hook.js';

export const EVENT_DESCRIPTIONS: Record<HookEvent, string> = {
  'run.started': 'Executado antes do início de uma rodada de tarefas',
  'run.completed': 'Executado ao finalizar com sucesso todas as tarefas',
  'run.failed': 'Executado se a rodada falhar ou abortar',
  'run.deadlock': 'Executado se o scheduler detectar deadlock de dependências',
  'task.started': 'Executado antes do agente iniciar uma task',
  'task.verify': 'Executado após o agente concluir para verificar o resultado',
  'task.completed': 'Executado após uma task ser confirmada como concluída',
  'task.failed': 'Executado após uma task falhar',
};

export interface HooksEventListProps {
  hooks?: HookMap;
  selectedIndex: number;
  onSelectEvent?: (event: HookEvent) => void;
  onClose?: () => void;
}

/**
 * Nível 1 - Lista de Eventos de Ciclo de Vida para configuração de Hooks.
 * Exibe os 8 eventos suportados com badges de contagem e descrições contextuais.
 */
export const HooksEventList: React.FC<HooksEventListProps> = ({
  hooks,
  selectedIndex,
}) => {
  return (
    <Box flexDirection="column" width="100%">
      {/* Cabeçalho */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          Configuração de Hooks - Selecione o Evento
        </Text>
        <Text dimColor>
          Selecione um evento de ciclo de vida para gerenciar seus comandos associados.
        </Text>
      </Box>

      {/* Lista dos 8 Eventos */}
      <Box flexDirection="column" marginY={0}>
        {HOOK_EVENTS.map((event, index) => {
          const isSelected = index === selectedIndex;
          const eventHooks = hooks?.[event] || [];
          const count = eventHooks.length;
          const badgeText =
            count > 0 ? `[${count} hook${count === 1 ? '' : 's'}]` : '[nenhum]';
          const badgeColor = count > 0 ? 'cyan' : 'gray';

          return (
            <Box key={event} flexDirection="row" gap={1} alignItems="center">
              <Text color={isSelected ? 'cyan' : 'gray'} bold={isSelected}>
                {isSelected ? '> ●' : '  ○'}
              </Text>
              <Box width={16}>
                <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'}>
                  {event}
                </Text>
              </Box>
              <Box width={12}>
                <Text color={badgeColor} bold={count > 0}>
                  {badgeText}
                </Text>
              </Box>
              <Box flexShrink={1}>
                <Text
                  color={isSelected ? 'white' : 'gray'}
                  dimColor={!isSelected}
                  wrap="truncate-end"
                >
                  {EVENT_DESCRIPTIONS[event]}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Barra Inferior de Atalhos */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        justifyContent="space-between"
        width="100%"
      >
        <Text dimColor>[↑/↓ ou k/j] Navegar</Text>
        <Text dimColor>[Enter ou →] Selecionar</Text>
        <Text dimColor>[Esc/q] Voltar</Text>
      </Box>
    </Box>
  );
};
