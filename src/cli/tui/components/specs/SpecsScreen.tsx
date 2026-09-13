import React from 'react';
import { Box } from 'ink';
import { AppContainer } from '../../../../infrastructure/container.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { CreateSpecModal } from './CreateSpecModal.js';
import { PullSpecModal } from './PullSpecModal.js';
import { SpecList, SpecItemWithStats, STATUS_BADGE_MAP } from './components/SpecList.js';
import { SpecDetails } from './components/SpecDetails.js';
import { SpecPlanProgress } from './components/SpecPlanProgress.js';
import { useSpecsScreen } from './hooks/useSpecsScreen.js';
import { SpecsActionFeedback } from './hooks/useSpecsScreen.js';
import { useSpecsHotkeys } from './hooks/useSpecsHotkeys.js';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal.js';
import { SupportedLanguage } from '../../../../config/types.js';
import { translate } from '../../../ui/i18n.js';

export type { SpecItemWithStats };
export { STATUS_BADGE_MAP };

export interface SpecsScreenProps {
  container?: AppContainer;
  initialSpecs?: SpecItemWithStats[];
  onOpenRun?: (specName: string) => void;
  onOpenTasks?: (specName: string) => void;
  onFeedback?: (feedback: SpecsActionFeedback) => void;
  onNotification?: (
    message: string,
    type?: 'success' | 'error' | 'info',
  ) => void;
  language?: SupportedLanguage;
  isInteractive?: boolean;
}

export const SpecsScreen: React.FC<SpecsScreenProps> = ({
  container: propContainer,
  initialSpecs,
  onOpenRun,
  onOpenTasks,
  onFeedback,
  onNotification,
  language: propLanguage,
  isInteractive = true,
}) => {
  const { breakpoint } = useTerminalDimensions();
  const {
    container,
    specs,
    selectedIndex,
    selectedSpec,
    activeModal,
    actionFeedback,
    language,
    isValidating,
    isGeneratingPlan,
    planStartTime,
    planEndTime,
    planResult,
    validationErrors,
    generatingSpecName,
    navigateUp,
    navigateDown,
    openCreateModal,
    openPullModal,
    closeModal,
    openDeleteModal,
    cancelDelete,
    confirmDelete,
    handleOpenInRun,
    handleOpenInTasks,
    handleValidatePlan,
    handleGeneratePlan,
    handleModalSuccess,
    isTextInputActive,
  } = useSpecsScreen({
    container: propContainer,
    initialSpecs,
    onOpenRun,
    onOpenTasks,
    onFeedback,
    onNotification,
    language: propLanguage,
  });

  useSpecsHotkeys({
    isInteractive,
    isModalOpen: activeModal !== null,
    isTextInputActive,
    hasSelectedSpec: selectedSpec !== null,
    onNavigateUp: navigateUp,
    onNavigateDown: navigateDown,
    onOpenRun: () => {
      if (selectedSpec) {
        handleOpenInRun(selectedSpec.name);
      }
    },
    onOpenTasks: () => {
      if (selectedSpec) {
        handleOpenInTasks(selectedSpec.name);
      }
    },
    onGeneratePlan: () => {
      void handleGeneratePlan();
    },
    onValidatePlan: handleValidatePlan,
    onOpenCreateModal: openCreateModal,
    onOpenPullModal: openPullModal,
    onOpenDeleteModal: openDeleteModal,
  });

  if (activeModal === 'create') {
    return (
      <CreateSpecModal
        isOpen={true}
        onClose={closeModal}
        container={container}
        width="100%"
        onSuccess={(specName) => handleModalSuccess(specName, 'created')}
      />
    );
  }

  if (activeModal === 'pull') {
    return (
      <PullSpecModal
        isOpen={true}
        onClose={closeModal}
        container={container}
        width="100%"
        onSuccess={(specName) => handleModalSuccess(specName, 'pulled')}
      />
    );
  }

  if (activeModal === 'delete' && selectedSpec) {
    return (
      <ConfirmDeleteModal
        title={translate('tui_spec_delete_title', language)}
        body={translate('tui_spec_delete_body', language)}
        detail={translate('tui_spec_delete_detail', language, { spec: selectedSpec.name })}
        warning={translate('tui_spec_delete_warning', language)}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        language={language}
      />
    );
  }

  const isSideBySide = breakpoint !== 'minimal';

  const isSelectedSpecGenerating = Boolean(
    selectedSpec &&
    isGeneratingPlan &&
    (!generatingSpecName || generatingSpecName === selectedSpec.name)
  );
  const isSelectedSpecPersisted = Boolean(
    selectedSpec &&
    planResult &&
    (!generatingSpecName || generatingSpecName === selectedSpec.name)
  );
  const showPlanProgress = isSelectedSpecGenerating || isSelectedSpecPersisted;

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box flexDirection={isSideBySide ? 'row' : 'column'} width="100%" flexGrow={1}>
        <SpecList
          specs={specs}
          selectedIndex={selectedIndex}
          isSideBySide={isSideBySide}
        />
        <SpecDetails
          spec={selectedSpec}
          isSideBySide={isSideBySide}
          isValidating={isValidating}
          actionFeedback={actionFeedback}
          validationErrors={validationErrors}
        >
          <SpecPlanProgress
            specName={selectedSpec?.name}
            isGenerating={showPlanProgress ? isGeneratingPlan : false}
            startTime={showPlanProgress ? planStartTime : null}
            endTime={showPlanProgress ? planEndTime : null}
            result={showPlanProgress ? planResult : null}
          />
        </SpecDetails>
      </Box>
    </Box>
  );
};

export default SpecsScreen;
