import React from 'react';
import { Box } from 'ink';
import { AppContainer } from '../../../../infrastructure/container.js';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { CreateIntentModal } from './CreateIntentModal.js';
import { PullIntentModal } from './PullIntentModal.js';
import { IntentList, IntentItemWithStats, STATUS_BADGE_MAP } from './components/IntentList.js';
import { IntentDetails } from './components/IntentDetails.js';
import { IntentPlanProgress } from './components/IntentPlanProgress.js';
import { useIntentsScreen } from './hooks/useIntentsScreen.js';
import { IntentsActionFeedback } from './hooks/useIntentsScreen.js';
import { useIntentsHotkeys } from './hooks/useIntentsHotkeys.js';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal.js';
import { SupportedLanguage } from '../../../../config/types.js';
import { translate } from '../../../ui/i18n.js';

export type { IntentItemWithStats };export { STATUS_BADGE_MAP };

export interface IntentsScreenProps {
  container?: AppContainer;
  initialIntents?: IntentItemWithStats[];  onOpenRun?: (intentName: string) => void;
  onOpenTasks?: (intentName: string) => void;
  onFeedback?: (feedback: IntentsActionFeedback) => void;
  onNotification?: (
    message: string,
    type?: 'success' | 'error' | 'info',
  ) => void;
  language?: SupportedLanguage;
  isInteractive?: boolean;
}
export const IntentsScreen: React.FC<IntentsScreenProps> = ({
  container: propContainer,
  initialIntents,
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
    intents,
    selectedIndex,
    selectedIntent,
    activeModal,
    actionFeedback,
    language,
    isValidating,
    isGeneratingPlan,
    planStartTime,
    planEndTime,
    planResult,
    validationErrors,
    generatingIntentName,
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
  } = useIntentsScreen({
    container: propContainer,
    initialIntents,    onOpenRun,
    onOpenTasks,
    onFeedback,
    onNotification,
    language: propLanguage,
  });

  useIntentsHotkeys({
    isInteractive,
    isModalOpen: activeModal !== null,
    isTextInputActive,
    hasSelectedIntent: selectedIntent !== null,
    onNavigateUp: navigateUp,
    onNavigateDown: navigateDown,
    onOpenRun: () => {
      if (selectedIntent) {
        handleOpenInRun(selectedIntent.name);
      }
    },
    onOpenTasks: () => {
      if (selectedIntent) {
        handleOpenInTasks(selectedIntent.name);
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
      <CreateIntentModal
        isOpen={true}
        onClose={closeModal}
        container={container}
        width="100%"
        onSuccess={(intentName) => handleModalSuccess(intentName, 'created')}
      />
    );
  }

  if (activeModal === 'pull') {
    return (
      <PullIntentModal
        isOpen={true}
        onClose={closeModal}
        container={container}
        width="100%"
        onSuccess={(intentName) => handleModalSuccess(intentName, 'pulled')}
      />
    );
  }

  if (activeModal === 'delete' && selectedIntent) {
    const translatedTitle = translate('tui_intent_delete_title', language);
    const translatedBody = translate('tui_intent_delete_body', language);
    const translatedDetail = translate('tui_intent_delete_detail', language, { intent: selectedIntent.name });
    const translatedWarning = translate('tui_intent_delete_warning', language);

    return (
      <ConfirmDeleteModal
        title={translatedTitle !== 'tui_intent_delete_title' ? translatedTitle : 'Delete Intent'}
        body={translatedBody !== 'tui_intent_delete_body' ? translatedBody : 'Are you sure you want to permanently delete this intent?'}
        detail={translatedDetail !== 'tui_intent_delete_detail' ? translatedDetail : `Intent: ${selectedIntent.name}`}
        warning={translatedWarning !== 'tui_intent_delete_warning' ? translatedWarning : 'The intent, its tasks, and execution history will be deleted.'}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        language={language}
      />
    );
  }

  const isSideBySide = breakpoint !== 'minimal';

  const isSelectedIntentGenerating = Boolean(
    selectedIntent &&
    isGeneratingPlan &&
    (generatingIntentName === selectedIntent.name)
  );
  const isSelectedIntentPersisted = Boolean(
    selectedIntent &&
    planResult &&
    (generatingIntentName === selectedIntent.name)
  );
  const showPlanProgress = isSelectedIntentGenerating || isSelectedIntentPersisted;

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box flexDirection={isSideBySide ? 'row' : 'column'} width="100%" flexGrow={1}>
        <IntentList
          intents={intents}
          selectedIndex={selectedIndex}
          isSideBySide={isSideBySide}
        />
        <IntentDetails
          intent={selectedIntent}
          isSideBySide={isSideBySide}
          isValidating={isValidating}
          actionFeedback={actionFeedback}
          validationErrors={validationErrors}
        >
          <IntentPlanProgress
            intentName={selectedIntent?.name}
            isGenerating={showPlanProgress ? isGeneratingPlan : false}
            startTime={showPlanProgress ? planStartTime : null}
            endTime={showPlanProgress ? planEndTime : null}
            result={showPlanProgress ? planResult : null}
          />
        </IntentDetails>
      </Box>
    </Box>
  );
};export default IntentsScreen;
