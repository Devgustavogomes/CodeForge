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
import { useSpecsHotkeys } from './hooks/useSpecsHotkeys.js';

export type { SpecItemWithStats };
export { STATUS_BADGE_MAP };

export interface SpecsScreenProps {
  container?: AppContainer;
  initialSpecs?: SpecItemWithStats[];
  onOpenRun?: (specName: string) => void;
  onOpenTasks?: (specName: string) => void;
  isInteractive?: boolean;
}

export const SpecsScreen: React.FC<SpecsScreenProps> = ({
  container: propContainer,
  initialSpecs,
  onOpenRun,
  onOpenTasks,
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
  });

  useSpecsHotkeys({
    isInteractive,
    isModalOpen: activeModal !== null,
    isTextInputActive,
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
