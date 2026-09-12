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
import { ViewDocModal } from './ViewDocModal.js';
import { useDocsScreen } from './hooks/useDocsScreen.js';
import { useDocsHotkeys } from './hooks/useDocsHotkeys.js';
import { SupportedLanguage } from '../../../../config/types.js';

export { DocItemInfo };

export interface DocsScreenProps {
  container?: AppContainer;
  initialDocs?: DocItemInfo[];
  isInteractive?: boolean;
  language?: SupportedLanguage;
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
  language: propLanguage,
  onCreateDoc,
  onUpdateDoc,
  onConfirmDirectUpdate,
  onConfirmAutoUpdate,
  onViewDoc,
}) => {
  const { columns, rows, breakpoint } = useTerminalDimensions();
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
    language: resolvedLanguage,
    isCreateModalOpen,
    isUpdateModalOpen,
    isViewModalOpen,
    availableSpecs,
    handleCreateDoc,
    handleConfirmDirectUpdate,
    handleConfirmAutoUpdate,
    handleOpenCreateModal,
    handleCloseCreateModal,
    handleOpenUpdateModal,
    handleCloseUpdateModal,
    handleOpenViewModal,
    handleCloseViewModal,
  } = useDocsScreen({
    container,
    initialDocs,
    language: propLanguage,
    onCreateDoc,
    onUpdateDoc,
    onConfirmDirectUpdate,
    onConfirmAutoUpdate,
  });

  useDocsHotkeys({
    isInteractive,
    isModalOpen: isCreateModalOpen || isUpdateModalOpen || isViewModalOpen,
    isCreateModalOpen,
    isUpdateModalOpen,
    docsCount: docs.length,
    selectedIndex,
    onSelectIndex: setSelectedIndex,
    onOpenCreateModal: handleOpenCreateModal,
    onOpenUpdateModal: handleOpenUpdateModal,
    onViewDoc: () => {
      handleOpenViewModal();
      if (selectedDoc) {
        onViewDoc?.(selectedDoc);
      }
    },
    onClearFeedback: () => setFeedback(null),
  });

  if (isCreateModalOpen) {
    return (
      <CreateDocModal
        isOpen={true}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateDoc}
        availableSpecs={availableSpecs}
        language={resolvedLanguage}
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
        language={resolvedLanguage}
      />
    );
  }

  if (isViewModalOpen) {
    return (
      <ViewDocModal
        isOpen={true}
        doc={selectedDoc}
        content={previewContent}
        onClose={handleCloseViewModal}
        language={resolvedLanguage}
        width="100%"
      />
    );
  }

  const isSideBySide = breakpoint !== 'minimal' && columns >= 75;

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
        language={resolvedLanguage}
      />

      <Box flexDirection={isSideBySide ? 'row' : 'column'} width="100%" flexGrow={1}>
        <DocsList
          docs={docs}
          selectedIndex={selectedIndex}
          width={isSideBySide ? '45%' : '100%'}
          language={resolvedLanguage}
          maxVisibleDocs={!isSideBySide ? (rows < 22 ? 3 : 5) : (rows < 22 ? 4 : 6)}
        />
        <DocViewer
          selectedDoc={selectedDoc}
          width={isSideBySide ? '55%' : '100%'}
          previewContent={previewContent}
          language={resolvedLanguage}
        />
      </Box>
    </Box>
  );
};

export default DocsScreen;
