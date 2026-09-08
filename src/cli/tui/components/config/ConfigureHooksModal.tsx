import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from '../common/Modal.js';
import { HooksEventList } from './components/HooksEventList.js';
import { HooksCommandList } from './components/HooksCommandList.js';
import { HookForm } from './components/HookForm.js';
import { useConfigureHooksModal } from './hooks/useConfigureHooksModal.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { CodeForgeConfig } from '../../../../config/types.js';
import { ConfigService } from '../../../../config/ConfigService.js';
import { HookMap } from '../../../../domain/hook.js';

export interface ConfigureHooksModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateHooks?: (hooks: HookMap) => void;
  width?: number | string;
}

/**
 * Container modal para o Gerenciador de Hooks Interativo na TUI de Configuração.
 * Encapsula a máquina de estados (useConfigureHooksModal) e os três níveis hierárquicos:
 * - Nível 1: Lista de Eventos de Ciclo de Vida (HooksEventList)
 * - Nível 2: Lista de Comandos do Evento Selecionado (HooksCommandList)
 * - Nível 3: Formulário de Adição/Edição de Hook (HookForm)
 */
export const ConfigureHooksModal: React.FC<ConfigureHooksModalProps> = ({
  isOpen = true,
  onClose,
  config,
  configService,
  onUpdateHooks,
  width,
}) => {
  const { breakpoint } = useTerminalDimensions();

  const {
    view,
    selectedEventIndex,
    selectedEvent,
    selectedCommandIndex,
    commands,
    isEditing,
    run,
    setRun,
    type,
    setType,
    name,
    setName,
    activeFormField,
    activeFormFieldIndex,
    formErrorMessage,
    deleteConfirmIndex,
    feedbackMessage,
    hooks,
    saveHook,
    handleEsc,
  } = useConfigureHooksModal({
    isOpen,
    onClose,
    config,
    configService,
    onUpdateHooks,
  });

  if (!isOpen) {
    return null;
  }

  // Título dinâmico baseado na visão ativa
  let modalTitle = 'Configuração de Hooks';
  if (view === 'events') {
    modalTitle = 'Configuração de Hooks - Ciclo de Vida';
  } else if (view === 'commands') {
    modalTitle = `Hooks do Evento: ${selectedEvent}`;
  } else if (view === 'form') {
    modalTitle = isEditing
      ? `Editar Hook — ${selectedEvent}`
      : `Novo Hook — ${selectedEvent}`;
  }

  // Largura responsiva conforme dimensões do terminal
  const responsiveWidth =
    width ??
    (breakpoint === 'minimal' ? '100%' : breakpoint === 'wide' ? 88 : '90%');

  return (
    <Modal
      title={modalTitle}
      isOpen={isOpen}
      width={responsiveWidth}
      borderColor="cyan"
    >
      <Box flexDirection="column" width="100%">
        {/* Nível 1: Lista de Eventos */}
        {view === 'events' && (
          <HooksEventList
            hooks={hooks}
            selectedIndex={selectedEventIndex}
          />
        )}

        {/* Nível 2: Lista de Comandos do Evento Selecionado */}
        {view === 'commands' && (
          <HooksCommandList
            event={selectedEvent}
            commands={commands}
            selectedIndex={selectedCommandIndex}
            deleteConfirmIndex={deleteConfirmIndex}
            isDeleting={deleteConfirmIndex !== null}
          />
        )}

        {/* Nível 3: Formulário de Criação e Edição */}
        {view === 'form' && (
          <HookForm
            event={selectedEvent}
            activeField={activeFormField}
            activeFieldIndex={activeFormFieldIndex}
            run={run}
            type={type}
            name={name}
            isEditing={isEditing}
            errorMessage={formErrorMessage}
            onChangeRun={setRun}
            onChangeType={setType}
            onChangeName={setName}
            onSubmit={saveHook}
            onCancel={handleEsc}
          />
        )}

        {/* Barra inferior de feedback temporário (Auto-Save / Remoção) */}
        {feedbackMessage && (
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor={feedbackMessage.startsWith('✔') ? 'green' : 'red'}
            paddingX={1}
            justifyContent="space-between"
          >
            <Text
              color={feedbackMessage.startsWith('✔') ? 'green' : 'red'}
              bold
            >
              {feedbackMessage}
            </Text>
            <Text dimColor>[Auto-Save]</Text>
          </Box>
        )}
      </Box>
    </Modal>
  );
};
