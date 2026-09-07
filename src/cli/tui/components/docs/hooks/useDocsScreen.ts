import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { DocsManifest } from '../../../../../domain/doc.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { DocItemInfo } from '../components/DocsList.js';

export { DocItemInfo };

export function formatDocDuration(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
}

export interface UseDocsScreenOptions {
  container?: AppContainer;
  initialDocs?: DocItemInfo[];
  onCreateDoc?: (docName: string, specName: string) => Promise<void> | void;
  onUpdateDoc?: (docName: string, specName: string) => Promise<void> | void;
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedFormatted, setElapsedFormatted] = useState<string | null>(null);
  const [operation, setOperation] = useState<'create' | 'update' | null>(null);
  const [activeOperationDoc, setActiveOperationDoc] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DocFeedback | null>(null);

  const availableSpecs = useMemo(() => {
    try {
      return container.listSpecsUseCase.listNames();
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
    try {
      if (container.gw.exists(selectedDoc.path)) {
        return container.gw.readFile(selectedDoc.path);
      }
    } catch {
      // ignore
    }
    return null;
  }, [selectedDoc, container]);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
    setFeedback(null);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
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

  const handleUpdateDoc = useCallback(
    async (targetDocName?: string, targetSpecName?: string) => {
      const targetDoc = targetDocName
        ? docs.find((d) => d.name === targetDocName) ?? selectedDoc
        : selectedDoc;

      if (!targetDoc) return;

      const start = Date.now();
      setIsGenerating(true);
      setStartTime(start);
      setOperation('update');
      const docDisplayName = targetDoc.name.endsWith('.md')
        ? targetDoc.name
        : `${targetDoc.name}.md`;
      setActiveOperationDoc(docDisplayName);
      setFeedback(null);

      try {
        let spec = targetSpecName;
        if (!spec) {
          if (targetDoc.specs && targetDoc.specs.length > 0) {
            spec = targetDoc.specs[0].replace(/^.*[\\/]/, '').replace(/\.md$/, '');
          } else {
            spec = exec?.activeSpec || '';
          }
        }
        if (!spec) {
          const specs = container.listSpecsUseCase.listNames();
          spec = specs[0] || '';
        }

        if (onUpdateDoc) {
          await onUpdateDoc(targetDoc.name, spec);
        } else {
          const updateUseCase = container.updateDocUseCase;
          const manualResult = updateUseCase.getManualDoc(spec, targetDoc.name);
          if (manualResult.kind !== 'doc') {
            throw new Error(`Update preparation failed: ${manualResult.kind}`);
          }
          await updateUseCase.execute(spec, manualResult.doc, true);
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
        const formatted = formatDocDuration(elapsed);
        setElapsedFormatted(formatted);
        setIsGenerating(false);
        loadDocs();
        setFeedback({
          type: 'success',
          message: `✓ Documentação "${docDisplayName}" atualizada com sucesso em ${formatted}!`,
          elapsed: formatted,
        });
      } catch (err: unknown) {
        setIsGenerating(false);
        const msg = err instanceof Error ? err.message : String(err);
        setFeedback({
          type: 'error',
          message: `Falha ao atualizar documentação: ${msg}`,
        });
      }
    },
    [docs, selectedDoc, exec?.activeSpec, container, onUpdateDoc, loadDocs]
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
    feedback,
    setFeedback,
    isCreateModalOpen,
    availableSpecs,
    loadDocs,
    handleCreateDoc,
    handleUpdateDoc,
    handleOpenCreateModal,
    handleCloseCreateModal,
  };
}

export default useDocsScreen;
