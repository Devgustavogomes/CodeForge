import React, { useMemo } from 'react';
import { useInput } from 'ink';
import { Modal } from '../common/Modal.js';
import {
  UpdateModeSelectStep,
  DirectUpdateStep,
  AutoUpdateStep,
} from './components/update/index.js';
import {
  useUpdateDocModal,
  UpdateMode,
  UpdateStep,
  AutoTarget,
  UpdateConfirmPayload,
} from './hooks/useUpdateDocModal.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { AffectedDoc } from '../../../../domain/doc.js';
import { DocItemInfo } from './components/DocsList.js';

export type { UpdateMode, UpdateStep, AutoTarget, UpdateConfirmPayload };

export interface UpdateDocModalProps {
  isOpen?: boolean;
  onClose: () => void;
  selectedDoc?:
    | DocItemInfo
    | { name: string; specs?: string[]; [key: string]: unknown }
    | string
    | null;
  availableSpecs?: string[];
  initialSpec?: string;
  initialMode?: UpdateMode;
  initialStep?: UpdateStep;
  container?: AppContainer;
  onConfirmDirect?: (docName: string, specName: string) => Promise<void> | void;
  onConfirmAuto?: (
    specName: string,
    target: AutoTarget,
    affectedDocs: AffectedDoc[]
  ) => Promise<void> | void;
  onConfirm?: (payload: UpdateConfirmPayload) => Promise<void> | void;
  width?: string | number;
  title?: string;
  error?: string | null;
  isLoading?: boolean;
}

/**
 * Componente modal orquestrador para o fluxo de atualização de documentações na TUI.
 *
 * Gerencia a transição entre:
 * - Etapa 1: Seleção de modo de atualização (Manual/Direto vs Automático/Git)
 * - Etapa 2A: Revisão do documento alvo e seleção horizontal da especificação
 * - Etapa 2B: Resolução de arquivos/documentos impactados via Git e escopo do manifest
 *
 * Previne qualquer execução assíncrona deliberada de IA antes da confirmação do usuário com Enter na Etapa 2.
 */
export const UpdateDocModal: React.FC<UpdateDocModalProps> = ({
  isOpen = true,
  onClose,
  selectedDoc = null,
  availableSpecs,
  initialSpec,
  initialMode = 'direct',
  initialStep = 'mode-select',
  container,
  onConfirmDirect,
  onConfirmAuto,
  onConfirm,
  width = '100%',
  title: propTitle,
  error: propError,
  isLoading = false,
}) => {
  const normalizedSelectedDoc = useMemo(() => {
    if (typeof selectedDoc === 'string') {
      return { name: selectedDoc };
    }
    return selectedDoc;
  }, [selectedDoc]);

  const {
    step,
    mode,
    handleSelectMode,
    handleCycleMode,
    selectedSpec,
    availableSpecs: resolvedAvailableSpecs,
    handleCycleSpec,
    targetDocName,
    targetDocDisplayName,
    affectedResult,
    affectedDocs,
    autoSelectedIndex,
    selectedAutoTarget,
    handleCycleAutoTarget,
    edgeCaseMessage,
    handleConfirm,
    handleBack,
  } = useUpdateDocModal({
    isOpen,
    container,
    selectedDoc: normalizedSelectedDoc,
    availableSpecs,
    initialSpec,
    initialMode,
    initialStep,
    onClose,
    onConfirmDirect,
    onConfirmAuto,
    onConfirm,
  });

  const defaultTitle = useMemo(() => {
    switch (step) {
      case 'direct':
        return 'Atualizar Documentação — Modo Direto';
      case 'auto':
        return 'Atualizar Documentação — Modo Automático';
      case 'mode-select':
      default:
        return 'Atualizar Documentação';
    }
  }, [step]);

  const modalTitle = propTitle ?? defaultTitle;

  useInput(
    (input, key) => {
      if (!isOpen) return;

      // 1. Esc: retrocede para Etapa 1 se na Etapa 2, ou invoca onClose se na Etapa 1
      if (key.escape || input === '\u001B') {
        handleBack();
        return;
      }

      // 2. Setas verticais ou k/j:
      // - Etapa 1: alternar/navegar entre Modo Direto e Modo Automático
      // - Etapa 2B: navegar entre "[ Atualizar todos ]" e documentos específicos
      if (key.upArrow || input === 'k' || input === 'K') {
        if (step === 'mode-select') {
          handleCycleMode();
          return;
        }
        if (step === 'auto') {
          handleCycleAutoTarget(-1);
          return;
        }
      }

      if (key.downArrow || input === 'j' || input === 'J') {
        if (step === 'mode-select') {
          handleCycleMode();
          return;
        }
        if (step === 'auto') {
          handleCycleAutoTarget(1);
          return;
        }
      }

      // Teclas numéricas e Tab para seleção direta na Etapa 1
      if (step === 'mode-select') {
        if (input === '1') {
          handleSelectMode('direct');
          return;
        }
        if (input === '2') {
          handleSelectMode('auto');
          return;
        }
        if (key.tab) {
          handleCycleMode();
          return;
        }
      }

      // 3. Setas horizontais ou Espaço: alternar/ciclar a spec de referência na Etapa 2A e 2B
      if (step === 'direct' || step === 'auto') {
        if (key.leftArrow) {
          handleCycleSpec(-1);
          return;
        }
        if (key.rightArrow || input === ' ') {
          handleCycleSpec(1);
          return;
        }
      }

      // 4. Enter: avançar da Etapa 1 para a Etapa 2, ou confirmar atualização na Etapa 2
      if (key.return || input === '\r' || input === '\n') {
        void handleConfirm();
        return;
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) {
    return null;
  }

  const isEdgeCase =
    affectedResult?.kind === 'no-git' ||
    affectedResult?.kind === 'no-changed-files' ||
    affectedResult?.kind === 'no-affected-docs';

  return (
    <Modal
      title={modalTitle}
      isOpen={isOpen}
      width={width}
      borderColor="cyan"
    >
      {step === 'mode-select' && (
        <UpdateModeSelectStep
          selectedMode={mode}
          selectedDocName={targetDocDisplayName || targetDocName}
          width="100%"
        />
      )}

      {step === 'direct' && (
        <DirectUpdateStep
          docName={targetDocName}
          availableSpecs={resolvedAvailableSpecs}
          selectedSpec={selectedSpec}
          width="100%"
          error={propError ?? (edgeCaseMessage && !isEdgeCase ? edgeCaseMessage : null)}
          isLoading={isLoading}
        />
      )}

      {step === 'auto' && (
        <AutoUpdateStep
          selectedSpec={selectedSpec}
          resultKind={affectedResult?.kind}
          affectedDocs={affectedDocs}
          selectedIndex={autoSelectedIndex}
          selectedTarget={selectedAutoTarget}
          width="100%"
          error={propError ?? (!isEdgeCase ? edgeCaseMessage : null)}
        />
      )}
    </Modal>
  );
};

export default UpdateDocModal;
