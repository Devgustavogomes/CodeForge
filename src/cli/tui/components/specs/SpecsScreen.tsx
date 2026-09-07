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
  isInteractive?: boolean;
}

export const SpecsScreen: React.FC<SpecsScreenProps> = ({
  container: propContainer,
  initialSpecs,
  onOpenRun,
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
    navigateUp,
    navigateDown,
    openCreateModal,
    openPullModal,
    closeModal,
    handleOpenInRun,
    handleValidatePlan,
    handleGeneratePlan,
    handleModalSuccess,
    isTextInputActive,
  } = useSpecsScreen({
    container: propContainer,
    initialSpecs,
    onOpenRun,
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
            isGenerating={isGeneratingPlan}
            startTime={planStartTime}
            endTime={planEndTime}
            result={planResult}
          />
        </SpecDetails>
      </Box>
    </Box>
  );
};

export default SpecsScreen;
