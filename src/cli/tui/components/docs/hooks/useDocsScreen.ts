import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { DocsManifest, AffectedDoc } from '../../../../../domain/doc.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { DocItemInfo } from '../components/DocsList.js';
import { BatchInfo } from '../components/DocProgressBanner.js';
import { AutoTarget } from './useUpdateDocModal.js';
import { formatElapsedSeconds } from '../../../utils/formatters.js';

export { DocItemInfo, BatchInfo, AutoTarget };

export function formatDocDuration(seconds: number): string {
  return formatElapsedSeconds(seconds);
}

export interface UseDocsScreenOptions {
  container?: AppContainer;
  initialDocs?: DocItemInfo[];
  onCreateDoc?: (docName: string, specName: string) => Promise<void> | void;
  onUpdateDoc?: (docName: string, specName: string) => Promise<void> | void;
  onConfirmDirectUpdate?: (docName: string, specName: string) => Promise<void> | void;
  onConfirmAutoUpdate?: (
    specName: string,
    target: AutoTarget,
    affectedDocs?: AffectedDoc[]
  ) => Promise<void> | void;
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
}: UseDocsScreenOptions = {}) {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer]
  );

  const nav = useContext(NavigationContext);
  const exec = useContext(ExecutionContext);

  const [docs, setDocs] = useState<DocItemInfo[]>(() => initialDocs ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedFormatted, setElapsedFormatted] = useState<string | null>(null);
  const [operation, setOperation] = useState<'create' | 'update' | null>(null);
  const [activeOperationDoc, setActiveOperationDoc] = useState<string | null>(null);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [feedback, setFeedback] = useState<DocFeedback | null>(null);

  const availableSpecs = useMemo(() => {
    return container.listSpecsUseCase.listNames();
  }, [container]);

  const loadDocs = useCallback(() => {
    try {
      const manifest: DocsManifest = container.docsManifestRepository.load();
      const loaded: DocItemInfo[] = [];
      const seen = new Set<string>();

      for (const [name, entry] of Object.entries(manifest.documents || {})) {
        seen.add(name);
        const exists = container.gw.exists(entry.path);
        loaded.push({
          name,
          path: entry.path,
          specs: entry.specs || [],
          scope: entry.scope || [],
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
                specs: [],
                scope: [],
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
    } catch {
      setDocs([]);
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
    setFeedback(null);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleOpenUpdateModal = useCallback(() => {
    if (docs.length === 0) return;
    setIsUpdateModalOpen(true);
    setIsCreateModalOpen(false);
    setFeedback(null);
  }, [docs.length]);

  const handleCloseUpdateModal = useCallback(() => {
    setIsUpdateModalOpen(false);
  }, []);

  const handleCreateDoc = useCallback(
    async (docName: string, specName: string) => {
      const docNameTrimmed = docName.trim().replace(/\.md$/i, '');
      const specNameTrimmed = specName.trim().replace(/\.md$/i, '');

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
          await onCreateDoc(docNameTrimmed, specNameTrimmed);
        } else {
          const result = await container.createDocUseCase.execute(
            docNameTrimmed,
            specNameTrimmed
          );
          if (result.kind === 'not-initialized') {
            throw new Error('Workspace not initialized (.codeforge/metadata.json not found).');
          }
          if (result.kind === 'spec-not-found') {
            throw new Error(`Specification "${specNameTrimmed}" not found in .codeforge/specs/.`);
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
          message: `✓ Documentação "${docNameTrimmed}" criada com sucesso em ${formatted}!`,
          elapsed: formatted,
        });
      } catch (err: unknown) {
        setIsGenerating(false);
        const msg = err instanceof Error ? err.message : String(err);
        setFeedback({
          type: 'error',
          message: `Falha ao criar documentação: ${msg}`,
        });
        throw err;
      }
    },
    [onCreateDoc, container, handleCloseCreateModal, loadDocs]
  );

  const handleConfirmDirectUpdate = useCallback(
    async (docName: string, specName: string) => {
      const docNameTrimmed = docName.trim().replace(/\.md$/i, '');
      const specNameTrimmed = specName.trim().replace(/\.md$/i, '');
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
          await onConfirmDirectUpdate(docNameTrimmed, specNameTrimmed);
        } else if (onUpdateDoc) {
          await onUpdateDoc(docNameTrimmed, specNameTrimmed);
        } else {
          const updateUseCase = container.updateDocUseCase;
          const manualResult = updateUseCase.getManualDoc(specNameTrimmed, docNameTrimmed);
          if (manualResult.kind === 'not-initialized') {
            throw new Error('Workspace not initialized (.codeforge/metadata.json not found).');
          }
          if (manualResult.kind === 'spec-not-found') {
            throw new Error(`Specification "${specNameTrimmed}" not found in .codeforge/specs/.`);
          }
          if (manualResult.kind === 'rules-not-found') {
            throw new Error('Documentation rules file not found (.codeforge/rules/docs.md).');
          }
          if (manualResult.kind === 'doc-not-found') {
            throw new Error(`Documentation "${docNameTrimmed}" not found.`);
          }
          await updateUseCase.execute(specNameTrimmed, manualResult.doc, true);
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
        const formatted = formatDocDuration(elapsed);
        setElapsedFormatted(formatted);
        setIsGenerating(false);
        setBatchInfo(null);
        loadDocs();
        setFeedback({
          type: 'success',
          message: `✓ Documentação "${docDisplayName}" atualizada com sucesso em ${formatted}!`,
          elapsed: formatted,
        });
      } catch (err: unknown) {
        setIsGenerating(false);
        setBatchInfo(null);
        const msg = err instanceof Error ? err.message : String(err);
        setFeedback({
          type: 'error',
          message: `Falha ao atualizar documentação: ${msg}`,
        });
      }
    },
    [container, onConfirmDirectUpdate, onUpdateDoc, handleCloseUpdateModal, loadDocs]
  );

  const handleConfirmAutoUpdate = useCallback(
    async (
      specName: string,
      target: AutoTarget,
      passedAffectedDocs?: AffectedDoc[]
    ) => {
      const cleanSpec = specName.trim().replace(/\.md$/i, '');
      handleCloseUpdateModal();

      let affectedDocsList: AffectedDoc[] = passedAffectedDocs ?? [];
      if (affectedDocsList.length === 0) {
        try {
          const result = container.updateDocUseCase.getAffectedDocs(cleanSpec);
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
            const manualRes = container.updateDocUseCase.getManualDoc(cleanSpec, targetClean);
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
          message: 'Nenhum documento afetado encontrado para atualizar.',
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
          await onConfirmAutoUpdate(cleanSpec, target, docsToUpdate);
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

            await container.updateDocUseCase.execute(cleanSpec, doc, false);
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
            ? `✓ ${total} documentações atualizadas com sucesso em ${formatted}!`
            : `✓ Documentação "${docsToUpdate[0]?.docName.trim().replace(/\.md$/i, '')}.md" atualizada com sucesso em ${formatted}!`;

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
          message: `Falha ao atualizar documentação: ${msg}`,
        });
      }
    },
    [container, onConfirmAutoUpdate, handleCloseUpdateModal, loadDocs]
  );

  const handleUpdateDoc = useCallback(
    async (targetDocName?: string, targetSpecName?: string) => {
      if (targetDocName && targetSpecName) {
        return handleConfirmDirectUpdate(targetDocName, targetSpecName);
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
    isCreateModalOpen,
    isUpdateModalOpen,
    availableSpecs,
    loadDocs,
    handleCreateDoc,
    handleUpdateDoc,
    handleConfirmDirectUpdate,
    handleConfirmAutoUpdate,
    handleOpenCreateModal,
    handleCloseCreateModal,
    handleOpenUpdateModal,
    handleCloseUpdateModal,
  };
}

export default useDocsScreen;
