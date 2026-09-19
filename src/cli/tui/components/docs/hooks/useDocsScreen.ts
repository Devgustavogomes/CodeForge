import { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { DocsManifest, AffectedDoc } from '../../../../../domain/doc.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { DocItemInfo } from '../components/DocsList.js';
import { BatchInfo } from '../components/DocProgressBanner.js';
import { AutoTarget } from './useUpdateDocModal.js';
import { formatElapsedSeconds } from '../../../utils/formatters.js';
import { translate } from '../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../config/types.js';

export { DocItemInfo, BatchInfo, AutoTarget };

export function formatDocDuration(seconds: number): string {
  return formatElapsedSeconds(seconds);
}

export interface UseDocsScreenOptions {
  container?: AppContainer;
  initialDocs?: DocItemInfo[];
  onCreateDoc?: (docName: string, intentName: string) => Promise<void> | void;
  onUpdateDoc?: (docName: string, intentName: string) => Promise<void> | void;
  onConfirmDirectUpdate?: (docName: string, intentName: string) => Promise<void> | void;
  onConfirmAutoUpdate?: (
    intentName: string,
    target: AutoTarget,
    affectedDocs?: AffectedDoc[]
  ) => Promise<void> | void;
  onNotification?: (message: string, type?: DocFeedback['type']) => void;
  language?: SupportedLanguage;
}

export interface DocFeedback {
  type: 'success' | 'error' | 'info';
  message: string;
  elapsed?: string;
}

export function useDocsScreen({
  container: propContainer,
  initialDocs,
  onCreateDoc,
  onUpdateDoc,
  onConfirmDirectUpdate,
  onConfirmAutoUpdate,
  onNotification,
  language: propLanguage,
}: UseDocsScreenOptions = {}) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer]
  );

  const language: SupportedLanguage = useMemo(() => {
    if (propLanguage) return propLanguage;
    try {
      return container.configService.loadConfig()?.language ?? 'en';
    } catch {
      return 'en';
    }
  }, [propLanguage, container]);

  const nav = useContext(NavigationContext);

  const [docs, setDocs] = useState<DocItemInfo[]>(() => initialDocs ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocItemInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedFormatted, setElapsedFormatted] = useState<string | null>(null);
  const [operation, setOperation] = useState<'create' | 'update' | null>(null);
  const [activeOperationDoc, setActiveOperationDoc] = useState<string | null>(null);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [feedback, setFeedback] = useState<DocFeedback | null>(null);
  const isDeletingRef = useRef(false);

  const availableIntents = useMemo(() => {
    try {
      return container.listIntentsUseCase.listNames();
    } catch {
      return [];
    }
  }, [container]);

  const loadDocs = useCallback(() => {
    try {
      const manifest: DocsManifest = container.docsManifestRepository.load();
      const loaded: DocItemInfo[] = [];
      const seen = new Set<string>();

      for (const [name, entry] of Object.entries(manifest.documents || {})) {
        seen.add(name);
        const exists = container.gw.exists(entry.path);
        const entryIntents = entry.intents || (entry as unknown as { intents?: string[] }).intents || [];
        loaded.push({
          name,
          path: entry.path,
          intents: entryIntents,          scope: entry.scope || [],
          createdAt: entry.createdAt || 'N/A',
          updatedAt: entry.updatedAt || 'N/A',
          existsOnDisk: exists,
          inManifest: true,
        });
      }

      if (container.gw.exists(PATHS.docsDir)) {
        const files = container.gw.listDir(PATHS.docsDir);
        for (const file of files) {
          if (file.endsWith('.md') && !file.includes('.prompt.')) {
            const name = file.replace(/\.md$/, '');
            if (!seen.has(name)) {
              loaded.push({
                name,
                path: `${PATHS.docsDir}/${file}`,
                intents: [],                scope: [],
                createdAt: 'N/A',
                updatedAt: 'N/A',
                existsOnDisk: true,
                inManifest: false,
              });
            }
          }
        }
      }

      loaded.sort((a, b) => a.name.localeCompare(b.name));
      setDocs(loaded);
      setSelectedIndex((current) =>
        Math.min(Math.max(0, current), Math.max(0, loaded.length - 1))
      );
    } catch {
      setDocs([]);
      setSelectedIndex(0);
    }
  }, [container]);

  useEffect(() => {
    if (!initialDocs) {
      loadDocs();
    }
  }, [initialDocs, loadDocs]);

  const selectedDoc = docs[selectedIndex] ?? null;

  const previewContent = useMemo(() => {
    if (!selectedDoc?.existsOnDisk) return null;
    if (container.gw.exists(selectedDoc.path)) {
      return container.gw.readFile(selectedDoc.path);
    }
    return null;
  }, [selectedDoc, container]);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
    setIsUpdateModalOpen(false);
    setIsViewModalOpen(false);
    setDeleteTarget(null);
    setFeedback(null);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleOpenUpdateModal = useCallback(() => {
    if (docs.length === 0) return;
    setIsUpdateModalOpen(true);
    setIsCreateModalOpen(false);
    setIsViewModalOpen(false);
    setDeleteTarget(null);
    setFeedback(null);
  }, [docs.length]);

  const handleCloseUpdateModal = useCallback(() => {
    setIsUpdateModalOpen(false);
  }, []);

  const handleOpenViewModal = useCallback(() => {
    if (!selectedDoc) return;
    setIsViewModalOpen(true);
    setIsCreateModalOpen(false);
    setIsUpdateModalOpen(false);
    setDeleteTarget(null);
    setFeedback(null);
  }, [selectedDoc]);

  const handleCloseViewModal = useCallback(() => {
    setIsViewModalOpen(false);
  }, []);

  const handleOpenDeleteModal = useCallback(() => {
    if (!selectedDoc) return;
    setDeleteTarget(selectedDoc);
    setIsCreateModalOpen(false);
    setIsUpdateModalOpen(false);
    setIsViewModalOpen(false);
    setFeedback(null);
  }, [selectedDoc]);

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const publishDeleteFeedback = useCallback(
    (nextFeedback: DocFeedback) => {
      setFeedback(nextFeedback);
      onNotification?.(nextFeedback.message, nextFeedback.type);
    },
    [onNotification]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || isDeletingRef.current) return;

    const targetName = deleteTarget.name;
    isDeletingRef.current = true;

    try {
      const result = await Promise.resolve(
        container.deleteDocUseCase.execute(targetName)
      );

      switch (result.kind) {
        case 'deleted': {
          loadDocs();
          publishDeleteFeedback({
            type: 'success',
            message: translate('tui_docs_delete_success', language, {
              doc: result.docName,
            }),
          });
          break;
        }
        case 'not-initialized': {
          publishDeleteFeedback({
            type: 'error',
            message: translate('tui_delete_not_initialized', language),
          });
          break;
        }
        case 'doc-not-found': {
          publishDeleteFeedback({
            type: 'error',
            message: translate('tui_docs_delete_not_found', language, {
              doc: targetName,
            }),
          });
          break;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      publishDeleteFeedback({
        type: 'error',
        message: translate('tui_docs_delete_error', language, {
          doc: targetName,
          error: message,
        }),
      });
    } finally {
      isDeletingRef.current = false;
      setDeleteTarget(null);
    }
  }, [container, deleteTarget, language, loadDocs, publishDeleteFeedback]);

  const handleCreateDoc = useCallback(
    async (docName: string, intentName: string) => {
      const docNameTrimmed = docName.trim().replace(/\.md$/i, '');
      const intentNameTrimmed = intentName.trim().replace(/\.md$/i, '');

      const start = Date.now();
      setIsGenerating(true);
      setStartTime(start);
      setOperation('create');
      setActiveOperationDoc(docNameTrimmed);
      setBatchInfo(null);
      setFeedback(null);
      handleCloseCreateModal();

      try {
        if (onCreateDoc) {
          await onCreateDoc(docNameTrimmed, intentNameTrimmed);
        } else {
          const result = await container.createDocUseCase.execute(
            docNameTrimmed,
            intentNameTrimmed
          );
          if (result.kind === 'not-initialized') {
            throw new Error('Workspace not initialized (.codeforge/metadata.json not found).');
          }
          if (result.kind === 'intent-not-found') {
            throw new Error(`Intent "${intentNameTrimmed}" not found in .codeforge/intents/.`);
          }
          if (result.kind === 'rules-not-found') {
            throw new Error('Documentation rules file not found (.codeforge/rules/docs.md).');
          }
          if (result.kind === 'already-exists') {
            throw new Error(`Documentation "${docNameTrimmed}" already exists.`);
          }
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
        const formatted = formatDocDuration(elapsed);
        setElapsedFormatted(formatted);
        setIsGenerating(false);
        loadDocs();
        setFeedback({
          type: 'success',
          message: translate('tui_docs_create_success', language, {
            name: docNameTrimmed,
            elapsed: formatted,
          }),
          elapsed: formatted,
        });
      } catch (err: unknown) {
        setIsGenerating(false);
        const msg = err instanceof Error ? err.message : String(err);
        setFeedback({
          type: 'error',
          message: translate('tui_docs_create_failed', language, { error: msg }),
        });
        throw err;
      }
    },
    [onCreateDoc, container, handleCloseCreateModal, loadDocs, language]
  );

  const handleConfirmDirectUpdate = useCallback(
    async (docName: string, intentName: string) => {
      const docNameTrimmed = docName.trim().replace(/\.md$/i, '');
      const intentNameTrimmed = intentName.trim().replace(/\.md$/i, '');
      const docDisplayName = `${docNameTrimmed}.md`;

      handleCloseUpdateModal();
      const start = Date.now();
      setIsGenerating(true);
      setStartTime(start);
      setOperation('update');
      setActiveOperationDoc(docDisplayName);
      setBatchInfo(null);
      setFeedback(null);

      try {
        if (onConfirmDirectUpdate) {
          await onConfirmDirectUpdate(docNameTrimmed, intentNameTrimmed);
        } else if (onUpdateDoc) {
          await onUpdateDoc(docNameTrimmed, intentNameTrimmed);
        } else {
          const updateUseCase = container.updateDocUseCase;
          const manualResult = updateUseCase.getManualDoc(intentNameTrimmed, docNameTrimmed);
          if (manualResult.kind === 'not-initialized') {
            throw new Error('Workspace not initialized (.codeforge/metadata.json not found).');
          }
          if (manualResult.kind === 'intent-not-found') {
            throw new Error(`Intent "${intentNameTrimmed}" not found in .codeforge/intents/.`);
          }
          if (manualResult.kind === 'rules-not-found') {
            throw new Error('Documentation rules file not found (.codeforge/rules/docs.md).');
          }
          if (manualResult.kind === 'doc-not-found') {
            throw new Error(`Documentation "${docNameTrimmed}" not found.`);
          }
          await updateUseCase.execute(intentNameTrimmed, manualResult.doc, true);
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
        const formatted = formatDocDuration(elapsed);
        setElapsedFormatted(formatted);
        setIsGenerating(false);
        setBatchInfo(null);
        loadDocs();
        setFeedback({
          type: 'success',
          message: translate('tui_docs_update_single_success', language, {
            name: docDisplayName,
            elapsed: formatted,
          }),
          elapsed: formatted,
        });
      } catch (err: unknown) {
        setIsGenerating(false);
        setBatchInfo(null);
        const msg = err instanceof Error ? err.message : String(err);
        setFeedback({
          type: 'error',
          message: translate('tui_docs_update_failed', language, { error: msg }),
        });
      }
    },
    [container, onConfirmDirectUpdate, onUpdateDoc, handleCloseUpdateModal, loadDocs, language]
  );

  const handleConfirmAutoUpdate = useCallback(
    async (
      intentName: string,
      target: AutoTarget,
      passedAffectedDocs?: AffectedDoc[]
    ) => {
      const cleanIntent = intentName.trim().replace(/\.md$/i, '');
      handleCloseUpdateModal();

      let affectedDocsList: AffectedDoc[] = passedAffectedDocs ?? [];
      if (affectedDocsList.length === 0) {
        try {
          const result = container.updateDocUseCase.getAffectedDocs(cleanIntent);
          if (result.kind === 'affected-docs') {
            affectedDocsList = result.affectedDocs;
          }
        } catch {
          affectedDocsList = [];
        }
      }

      let docsToUpdate: AffectedDoc[] = [];
      if (target === 'all') {
        docsToUpdate = [...affectedDocsList];
      } else {
        const targetClean = target.trim().replace(/\.md$/i, '');
        const matched = affectedDocsList.find(
          (d) => d.docName.trim().replace(/\.md$/i, '') === targetClean
        );
        if (matched) {
          docsToUpdate = [matched];
        } else {
          try {
            const manualRes = container.updateDocUseCase.getManualDoc(cleanIntent, targetClean);
            if (manualRes.kind === 'doc') {
              docsToUpdate = [manualRes.doc];
            }
          } catch {
            // ignore
          }
        }
      }

      if (docsToUpdate.length === 0) {
        setFeedback({
          type: 'info',
          message: translate('tui_docs_update_none_affected', language),
        });
        return;
      }

      const start = Date.now();
      setIsGenerating(true);
      setStartTime(start);
      setOperation('update');
      setFeedback(null);

      const total = docsToUpdate.length;
      try {
        if (onConfirmAutoUpdate) {
          await onConfirmAutoUpdate(cleanIntent, target, docsToUpdate);
        } else {
          for (let i = 0; i < total; i++) {
            const doc = docsToUpdate[i];
            const cleanName = doc.docName.trim().replace(/\.md$/i, '');
            const docDisplayName = `${cleanName}.md`;

            if (total > 1) {
              setActiveOperationDoc(`[${i + 1}/${total}] ${docDisplayName}`);
              setBatchInfo({ current: i + 1, total });
            } else {
              setActiveOperationDoc(docDisplayName);
              setBatchInfo(null);
            }

            await container.updateDocUseCase.execute(cleanIntent, doc, false);
          }
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
        const formatted = formatDocDuration(elapsed);
        setElapsedFormatted(formatted);
        setIsGenerating(false);
        setBatchInfo(null);
        loadDocs();

        const successMessage =
          total > 1
            ? translate('tui_docs_update_batch_success', language, { count: total, elapsed: formatted })
            : translate('tui_docs_update_single_success', language, {
                name: `${docsToUpdate[0]?.docName.trim().replace(/\.md$/i, '')}.md`,
                elapsed: formatted,
              });

        setFeedback({
          type: 'success',
          message: successMessage,
          elapsed: formatted,
        });
      } catch (err: unknown) {
        setIsGenerating(false);
        setBatchInfo(null);
        loadDocs();
        const msg = err instanceof Error ? err.message : String(err);
        setFeedback({
          type: 'error',
          message: translate('tui_docs_update_failed', language, { error: msg }),
        });
      }
    },
    [container, onConfirmAutoUpdate, handleCloseUpdateModal, loadDocs, language]
  );

  const handleUpdateDoc = useCallback(
    async (targetDocName?: string, targetIntentName?: string) => {
      if (targetDocName && targetIntentName) {
        return handleConfirmDirectUpdate(targetDocName, targetIntentName);
      }
      handleOpenUpdateModal();
    },
    [handleConfirmDirectUpdate, handleOpenUpdateModal]
  );

  return {
    container,
    nav,
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
    language,
    isCreateModalOpen,
    isUpdateModalOpen,
    isViewModalOpen,
    isDeleteModalOpen: deleteTarget !== null,
    deleteTarget,
    availableIntents,
    loadDocs,
    handleCreateDoc,
    handleUpdateDoc,
    handleConfirmDirectUpdate,
    handleConfirmAutoUpdate,
    handleOpenCreateModal,
    handleCloseCreateModal,
    handleOpenUpdateModal,
    handleCloseUpdateModal,
    handleOpenViewModal,
    handleCloseViewModal,
    handleOpenDeleteModal,
    handleCancelDelete,
    handleConfirmDelete,
  };
}

export default useDocsScreen;
