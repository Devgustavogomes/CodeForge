import React from 'react';
import { Box } from 'ink';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { AffectedDoc } from '../../../../domain/doc.js';
import { DocProgressBanner } from './components/DocProgressBanner.js';
import { DocsList, DocItemInfo } from './components/DocsList.js';
import { DocViewer } from './components/DocViewer.js';
import { CreateDocModal } from './CreateDocModal.js';
import { UpdateDocModal, AutoTarget } from './UpdateDocModal.js';
import { useDocsScreen } from './hooks/useDocsScreen.js';
import { useDocsHotkeys } from './hooks/useDocsHotkeys.js';

export { DocItemInfo };

export interface DocsScreenProps {
  container?: AppContainer;
  initialDocs?: DocItemInfo[];
  isInteractive?: boolean;
  onCreateDoc?: (docName: string, specName: string) => Promise<void> | void;
  onUpdateDoc?: (docName: string, specName: string) => Promise<void> | void;
  onConfirmDirectUpdate?: (docName: string, specName: string) => Promise<void> | void;
  onConfirmAutoUpdate?: (
    specName: string,
    target: AutoTarget,
    affectedDocs?: AffectedDoc[]
  ) => Promise<void> | void;
  onViewDoc?: (doc: DocItemInfo) => void;
}

export const DocsScreen: React.FC<DocsScreenProps> = ({
  container,
  initialDocs,
  isInteractive = true,
  onCreateDoc,
  onUpdateDoc,
  onConfirmDirectUpdate,
  onConfirmAutoUpdate,
  onViewDoc,
}) => {
  const { breakpoint } = useTerminalDimensions();
  const {
    container: resolvedContainer,
    docs,
    selectedIndex,
    setSelectedIndex,
    selectedDoc,
    previewContent,
    isGenerating,
    startTime,
    elapsedFormatted,
    operation,
    activeOperationDoc,
    batchInfo,
    feedback,
    setFeedback,
    isCreateModalOpen,
    isUpdateModalOpen,
    availableSpecs,
    handleCreateDoc,
    handleConfirmDirectUpdate,
    handleConfirmAutoUpdate,
    handleOpenCreateModal,
    handleCloseCreateModal,
    handleOpenUpdateModal,
    handleCloseUpdateModal,
  } = useDocsScreen({
    container,
    initialDocs,
    onCreateDoc,
    onUpdateDoc,
    onConfirmDirectUpdate,
    onConfirmAutoUpdate,
  });

  useDocsHotkeys({
    isInteractive,
    isModalOpen: isCreateModalOpen || isUpdateModalOpen,
    isCreateModalOpen,
    isUpdateModalOpen,
    docsCount: docs.length,
    selectedIndex,
    onSelectIndex: setSelectedIndex,
    onOpenCreateModal: handleOpenCreateModal,
    onOpenUpdateModal: handleOpenUpdateModal,
    onViewDoc: () => selectedDoc && onViewDoc?.(selectedDoc),
    onClearFeedback: () => setFeedback(null),
  });

  if (isCreateModalOpen) {
    return (
      <CreateDocModal
        isOpen={true}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateDoc}
        availableSpecs={availableSpecs}
      />
    );
  }

  if (isUpdateModalOpen) {
    return (
      <UpdateDocModal
        isOpen={true}
        onClose={handleCloseUpdateModal}
        selectedDoc={selectedDoc}
        availableSpecs={availableSpecs}
        container={resolvedContainer}
        onConfirmDirect={handleConfirmDirectUpdate}
        onConfirmAuto={handleConfirmAutoUpdate}
      />
    );
  }

  const isSideBySide = breakpoint !== 'minimal';

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <DocProgressBanner
        isGenerating={isGenerating}
        operation={operation ?? undefined}
        docName={activeOperationDoc ?? (selectedDoc ? `${selectedDoc.name}.md` : undefined)}
        batchInfo={batchInfo}
        startTime={startTime}
        elapsedFormatted={elapsedFormatted ?? undefined}
        feedback={feedback}
      />

      <Box flexDirection={isSideBySide ? 'row' : 'column'} width="100%" flexGrow={1}>
        <DocsList
          docs={docs}
          selectedIndex={selectedIndex}
          width={isSideBySide ? '45%' : '100%'}
        />
        <DocViewer
          selectedDoc={selectedDoc}
          width={isSideBySide ? '55%' : '100%'}
          previewContent={previewContent}
        />
      </Box>
    </Box>
  );
};

export default DocsScreen;
