import { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { ExecutionContext } from '../../../context/ExecutionContext.js';
import { ContainerContext } from '../../../context/ContainerContext.js';
import { AppContainer, createAppContainer } from '../../../../../infrastructure/container.js';
import { AffectedDoc } from '../../../../../domain/doc.js';
import { DocsUpdateResult } from '../../../../../application/use-cases/UpdateDocUseCase.js';
import { DocItemInfo } from '../components/DocsList.js';
import { translate } from '../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../config/types.js';

export type UpdateMode = 'direct' | 'auto';
export type UpdateStep = 'mode-select' | 'direct' | 'auto';
export type AutoTarget = 'all' | string;

export type UpdateConfirmPayload =
  | { mode: 'direct'; docName: string; specName: string }
  | { mode: 'auto'; specName: string; target: AutoTarget; affectedDocs: AffectedDoc[] };

export interface UseUpdateDocModalOptions {
  isOpen?: boolean;
  container?: AppContainer;
  selectedDoc?: DocItemInfo | { name: string; specs?: string[]; [key: string]: unknown } | null;
  availableSpecs?: string[];
  initialSpec?: string;
  initialMode?: UpdateMode;
  initialStep?: UpdateStep;
  language?: SupportedLanguage;
  onClose?: () => void;
  onConfirmDirect?: (docName: string, specName: string) => void | Promise<void>;
  onConfirmAuto?: (
    specName: string,
    target: AutoTarget,
    affectedDocs: AffectedDoc[]
  ) => void | Promise<void>;
  onConfirm?: (payload: UpdateConfirmPayload) => void | Promise<void>;
}

export interface UseUpdateDocModalReturn {
  container: AppContainer;
  step: UpdateStep;
  setStep: (step: UpdateStep) => void;
  mode: UpdateMode;
  setMode: (mode: UpdateMode) => void;
  handleSelectMode: (mode: UpdateMode) => void;
  handleCycleMode: () => void;

  selectedSpec: string;
  setSelectedSpec: (spec: string) => void;
  availableSpecs: string[];
  handleCycleSpec: (direction?: 1 | -1) => void;

  selectedDoc: DocItemInfo | { name: string; specs?: string[]; [key: string]: unknown } | null;
  targetDocName: string;
  targetDocDisplayName: string;

  affectedResult: DocsUpdateResult | null;
  affectedDocs: AffectedDoc[];
  hasAffectedDocs: boolean;
  autoSelectedIndex: number;
  setAutoSelectedIndex: (index: number) => void;
  selectedAutoTarget: AutoTarget;
  selectedAffectedDoc: AffectedDoc | null;
  handleCycleAutoTarget: (direction?: 1 | -1) => void;
  resolveAffectedDocs: (specName?: string) => DocsUpdateResult;

  isNoGit: boolean;
  isNoChangedFiles: boolean;
  isNoAffectedDocs: boolean;
  edgeCaseMessage: string | null;
  language: SupportedLanguage;

  handleConfirm: () => Promise<void> | void;
  handleBack: () => void;
  reset: () => void;
}

export function cleanDocName(name?: string | null): string {
  if (!name) return '';
  return name.trim().replace(/\.md$/i, '');
}

export function cleanSpecName(spec?: string | null): string {
  if (!spec) return '';
  return spec
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(/\.md$/i, '')
    .trim();
}

export function determineInitialSpec(
  initialSpec?: string,
  sessionSpec?: string | null,
  docSpecs?: string[],
  available?: string[]
): string {
  if (initialSpec && initialSpec.trim()) {
    return cleanSpecName(initialSpec);
  }
  if (sessionSpec && sessionSpec.trim()) {
    return cleanSpecName(sessionSpec);
  }
  if (docSpecs && docSpecs.length > 0 && docSpecs[0].trim()) {
    return cleanSpecName(docSpecs[0]);
  }
  if (available && available.length > 0 && available[0].trim()) {
    return cleanSpecName(available[0]);
  }
  return '';
}

export function useUpdateDocModal({
  isOpen,
  container: propContainer,
  selectedDoc = null,
  availableSpecs: propAvailableSpecs,
  initialSpec,
  initialMode = 'direct',
  initialStep = 'mode-select',
  language: propLanguage,
  onClose,
  onConfirmDirect,
  onConfirmAuto,
  onConfirm,
}: UseUpdateDocModalOptions = {}): UseUpdateDocModalReturn {
  const contextContainer = useContext(ContainerContext);
  const container = useMemo(
    () => propContainer ?? contextContainer ?? createAppContainer(),
    [propContainer, contextContainer]
  );

  const exec = useContext(ExecutionContext);

  const language: SupportedLanguage = useMemo(() => {
    if (propLanguage) return propLanguage;
    try {
      return container.configService.loadConfig()?.language ?? 'en';
    } catch {
      return 'en';
    }
  }, [propLanguage, container]);

  const availableSpecs = useMemo(() => {
    let specs: string[];
    if (propAvailableSpecs !== undefined) {
      specs = propAvailableSpecs;
    } else {
      try {
        specs = container.listSpecsUseCase.listNames();
      } catch {
        specs = [];
      }
    }
    const cleaned = specs.map(cleanSpecName).filter(Boolean);
    return Array.from(new Set(cleaned));
  }, [propAvailableSpecs, container]);

  const [step, setStep] = useState<UpdateStep>(initialStep);
  const [mode, setMode] = useState<UpdateMode>(initialMode);
  const [selectedSpec, setSelectedSpec] = useState<string>(() =>
    determineInitialSpec(initialSpec, exec?.activeSpec, selectedDoc?.specs, availableSpecs)
  );

  const [affectedResult, setAffectedResult] = useState<DocsUpdateResult | null>(() => {
    if (initialStep === 'auto') {
      const spec = determineInitialSpec(
        initialSpec,
        exec?.activeSpec,
        selectedDoc?.specs,
        availableSpecs
      );
      if (spec) {
        try {
          return container.updateDocUseCase.getAffectedDocs(spec);
        } catch {
          return { kind: 'not-initialized' };
        }
      }
    }
    return null;
  });
  const [autoSelectedIndex, setAutoSelectedIndex] = useState<number>(0);

  const lastResolvedSpecRef = useRef<string | null>(
    initialStep === 'auto'
      ? determineInitialSpec(initialSpec, exec?.activeSpec, selectedDoc?.specs, availableSpecs) || null
      : null
  );

  const targetDocName = useMemo(() => {
    return cleanDocName(selectedDoc?.name);
  }, [selectedDoc]);

  const targetDocDisplayName = useMemo(() => {
    return targetDocName ? `${targetDocName}.md` : '';
  }, [targetDocName]);

  const affectedDocs = useMemo(() => {
    return affectedResult?.kind === 'affected-docs' ? affectedResult.affectedDocs : [];
  }, [affectedResult]);

  const hasAffectedDocs = affectedDocs.length > 0;

  const isNoGit = affectedResult?.kind === 'no-git';
  const isNoChangedFiles = affectedResult?.kind === 'no-changed-files';
  const isNoAffectedDocs = affectedResult?.kind === 'no-affected-docs';

  const edgeCaseMessage = useMemo((): string | null => {
    if (!affectedResult) return null;
    switch (affectedResult.kind) {
      case 'no-git':
        return translate('tui_docs_edge_no_git', language);
      case 'no-changed-files':
        return translate('tui_docs_edge_no_changed_files', language);
      case 'no-affected-docs':
        return translate('tui_docs_edge_no_affected_docs', language);
      case 'spec-not-found':
        return translate('tui_docs_edge_spec_not_found', language, { spec: selectedSpec });
      case 'rules-not-found':
        return translate('tui_docs_edge_rules_not_found', language);
      case 'not-initialized':
        return translate('tui_docs_edge_not_initialized', language);
      case 'affected-docs':
        return null;
      default:
        return null;
    }
  }, [affectedResult, selectedSpec, language]);

  const selectedAutoTarget: AutoTarget = useMemo(() => {
    if (autoSelectedIndex === 0 || affectedDocs.length === 0) {
      return 'all';
    }
    const doc = affectedDocs[autoSelectedIndex - 1];
    return doc ? doc.docName : 'all';
  }, [autoSelectedIndex, affectedDocs]);

  const selectedAffectedDoc: AffectedDoc | null = useMemo(() => {
    if (autoSelectedIndex === 0 || affectedDocs.length === 0) {
      return null;
    }
    return affectedDocs[autoSelectedIndex - 1] ?? null;
  }, [autoSelectedIndex, affectedDocs]);

  const resolveAffectedDocs = useCallback(
    (specName?: string): DocsUpdateResult => {
      const spec = specName ?? selectedSpec;
      lastResolvedSpecRef.current = spec;
      if (!spec) {
        const emptyResult: DocsUpdateResult = { kind: 'spec-not-found' };
        setAffectedResult(emptyResult);
        setAutoSelectedIndex(0);
        return emptyResult;
      }

      try {
        const result = container.updateDocUseCase.getAffectedDocs(spec);
        setAffectedResult(result);
        if (result.kind === 'affected-docs') {
          setAutoSelectedIndex((prev) => {
            const maxIdx = result.affectedDocs.length;
            return prev > maxIdx ? 0 : prev;
          });
        } else {
          setAutoSelectedIndex(0);
        }
        return result;
      } catch {
        const fallback: DocsUpdateResult = { kind: 'not-initialized' };
        setAffectedResult(fallback);
        setAutoSelectedIndex(0);
        return fallback;
      }
    },
    [container, selectedSpec]
  );

  const reset = useCallback(() => {
    setStep(initialStep);
    setMode(initialMode);
    setAutoSelectedIndex(0);
    const initial = determineInitialSpec(
      initialSpec,
      exec?.activeSpec,
      selectedDoc?.specs,
      availableSpecs
    );
    setSelectedSpec(initial);
    setAffectedResult(null);
    lastResolvedSpecRef.current = null;
  }, [initialStep, initialMode, initialSpec, exec?.activeSpec, selectedDoc?.specs, availableSpecs]);

  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      reset();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, reset]);

  useEffect(() => {
    if (!selectedSpec) {
      const resolved = determineInitialSpec(
        initialSpec,
        exec?.activeSpec,
        selectedDoc?.specs,
        availableSpecs
      );
      if (resolved) {
        setSelectedSpec(resolved);
      }
    }
  }, [initialSpec, exec?.activeSpec, selectedDoc?.specs, availableSpecs, selectedSpec]);

  useEffect(() => {
    if (step === 'auto' && selectedSpec && lastResolvedSpecRef.current !== selectedSpec) {
      resolveAffectedDocs(selectedSpec);
    }
  }, [step, selectedSpec, resolveAffectedDocs]);

  const handleSelectMode = useCallback((newMode: UpdateMode) => {
    setMode(newMode);
  }, []);

  const handleCycleMode = useCallback(() => {
    setMode((prev) => (prev === 'direct' ? 'auto' : 'direct'));
  }, []);

  const handleCycleSpec = useCallback(
    (direction: 1 | -1 = 1) => {
      if (availableSpecs.length === 0) return;
      const currentIdx = availableSpecs.indexOf(selectedSpec);
      const nextIdx =
        currentIdx === -1
          ? 0
          : (currentIdx + direction + availableSpecs.length) % availableSpecs.length;
      const nextSpec = availableSpecs[nextIdx];
      setSelectedSpec(nextSpec);
      if (step === 'auto') {
        resolveAffectedDocs(nextSpec);
      }
    },
    [availableSpecs, selectedSpec, step, resolveAffectedDocs]
  );

  const handleCycleAutoTarget = useCallback(
    (direction: 1 | -1 = 1) => {
      if (!affectedResult || affectedResult.kind !== 'affected-docs' || affectedDocs.length === 0) {
        setAutoSelectedIndex(0);
        return;
      }
      const totalOptions = 1 + affectedDocs.length;
      setAutoSelectedIndex((prev) => (prev + direction + totalOptions) % totalOptions);
    },
    [affectedResult, affectedDocs]
  );

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (step === 'mode-select') {
      if (mode === 'direct') {
        setStep('direct');
      } else {
        setStep('auto');
        resolveAffectedDocs(selectedSpec);
        setAutoSelectedIndex(0);
      }
      return;
    }

    if (step === 'direct') {
      await onConfirmDirect?.(targetDocName, selectedSpec);
      await onConfirm?.({
        mode: 'direct',
        docName: targetDocName,
        specName: selectedSpec,
      });
      return;
    }

    if (step === 'auto') {
      if (affectedResult?.kind !== 'affected-docs' || affectedDocs.length === 0) {
        return;
      }
      await onConfirmAuto?.(selectedSpec, selectedAutoTarget, affectedDocs);
      await onConfirm?.({
        mode: 'auto',
        specName: selectedSpec,
        target: selectedAutoTarget,
        affectedDocs,
      });
      return;
    }
  }, [
    step,
    mode,
    selectedSpec,
    targetDocName,
    affectedResult,
    affectedDocs,
    selectedAutoTarget,
    resolveAffectedDocs,
    onConfirmDirect,
    onConfirmAuto,
    onConfirm,
  ]);

  const handleBack = useCallback(() => {
    if (step === 'direct' || step === 'auto') {
      setStep('mode-select');
      lastResolvedSpecRef.current = null;
    } else if (step === 'mode-select') {
      onClose?.();
    }
  }, [step, onClose]);

  return {
    container,
    step,
    setStep,
    mode,
    setMode,
    handleSelectMode,
    handleCycleMode,
    selectedSpec,
    setSelectedSpec,
    availableSpecs,
    handleCycleSpec,
    selectedDoc,
    targetDocName,
    targetDocDisplayName,
    affectedResult,
    affectedDocs,
    hasAffectedDocs,
    autoSelectedIndex,
    setAutoSelectedIndex,
    selectedAutoTarget,
    selectedAffectedDoc,
    handleCycleAutoTarget,
    resolveAffectedDocs,
    isNoGit,
    isNoChangedFiles,
    isNoAffectedDocs,
    edgeCaseMessage,
    language,
    handleConfirm,
    handleBack,
    reset,
  };
}

export default useUpdateDocModal;
