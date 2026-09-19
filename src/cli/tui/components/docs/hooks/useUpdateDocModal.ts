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
  | { mode: 'direct'; docName: string; intentName: string }
  | { mode: 'auto'; intentName: string; target: AutoTarget; affectedDocs: AffectedDoc[] };

export interface UseUpdateDocModalOptions {
  isOpen?: boolean;
  container?: AppContainer;
  selectedDoc?: DocItemInfo | { name: string; intents?: string[];[key: string]: unknown } | null;
  availableIntents?: string[];
  initialIntent?: string;
  initialMode?: UpdateMode;
  initialStep?: UpdateStep;
  language?: SupportedLanguage;
  onClose?: () => void;
  onConfirmDirect?: (docName: string, intentName: string) => void | Promise<void>;
  onConfirmAuto?: (
    intentName: string,
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

  selectedIntent: string;
  setSelectedIntent: (intent: string) => void;
  availableIntents: string[];
  handleCycleIntent: (direction?: 1 | -1) => void;

  selectedDoc: DocItemInfo | { name: string; intents?: string[];[key: string]: unknown } | null;
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
  resolveAffectedDocs: (intentName?: string) => DocsUpdateResult;

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

export function cleanIntentName(intent?: string | null): string {
  if (!intent) return '';
  return intent
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(/\.md$/i, '')
    .trim();
}

export function determineInitialIntent(
  initialIntent?: string,
  sessionIntent?: string | null,
  docIntents?: string[],
  available?: string[]
): string {
  if (initialIntent && initialIntent.trim()) {
    return cleanIntentName(initialIntent);
  }
  if (sessionIntent && sessionIntent.trim()) {
    return cleanIntentName(sessionIntent);
  }
  if (docIntents && docIntents.length > 0 && docIntents[0].trim()) {
    return cleanIntentName(docIntents[0]);
  }
  if (available && available.length > 0 && available[0].trim()) {
    return cleanIntentName(available[0]);
  }
  return '';
}

export function useUpdateDocModal({
  isOpen,
  container: propContainer,
  selectedDoc = null,
  availableIntents: propAvailableIntents,
  initialIntent,
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

  const availableIntents = useMemo(() => {
    let intents: string[];
    if (propAvailableIntents !== undefined) {
      intents = propAvailableIntents;
    } else {
      try {
        intents = container.listIntentsUseCase.listNames();
      } catch {
        intents = [];
      }
    }
    const cleaned = intents.map(cleanIntentName).filter(Boolean);
    return Array.from(new Set(cleaned));
  }, [propAvailableIntents, container]);

  const selectedDocIntents = selectedDoc?.intents ?? (selectedDoc as { intents?: string[] } | null | undefined)?.intents;

  const [step, setStep] = useState<UpdateStep>(initialStep);
  const [mode, setMode] = useState<UpdateMode>(initialMode);
  const [selectedIntent, setSelectedIntent] = useState<string>(() =>
    determineInitialIntent(initialIntent, exec?.activeIntent, selectedDocIntents, availableIntents)
  );

  const [affectedResult, setAffectedResult] = useState<DocsUpdateResult | null>(() => {
    if (initialStep === 'auto') {
      const intent = determineInitialIntent(
        initialIntent,
        exec?.activeIntent,
        selectedDocIntents,
        availableIntents
      );
      if (intent) {
        try {
          return container.updateDocUseCase.getAffectedDocs(intent);
        } catch {
          return { kind: 'not-initialized' };
        }
      }
    }
    return null;
  });
  const [autoSelectedIndex, setAutoSelectedIndex] = useState<number>(0);

  const lastResolvedIntentRef = useRef<string | null>(
    initialStep === 'auto'
      ? determineInitialIntent(initialIntent, exec?.activeIntent, selectedDocIntents, availableIntents) || null
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
      case 'intent-not-found':
        return translate('tui_docs_edge_intent_not_found', language, { intent: selectedIntent });
      case 'rules-not-found':
        return translate('tui_docs_edge_rules_not_found', language);
      case 'not-initialized':
        return translate('tui_docs_edge_not_initialized', language);
      case 'affected-docs':
        return null;
      default:
        return null;
    }
  }, [affectedResult, selectedIntent, language]);

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
    (intentName?: string): DocsUpdateResult => {
      const intent = intentName ?? selectedIntent;
      lastResolvedIntentRef.current = intent;
      if (!intent) {
        const emptyResult: DocsUpdateResult = { kind: 'intent-not-found' };
        setAffectedResult(emptyResult);
        setAutoSelectedIndex(0);
        return emptyResult;
      }

      try {
        const result = container.updateDocUseCase.getAffectedDocs(intent);
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
    [container, selectedIntent]
  );

  const reset = useCallback(() => {
    setStep(initialStep);
    setMode(initialMode);
    setAutoSelectedIndex(0);
    const initial = determineInitialIntent(
      initialIntent,
      exec?.activeIntent,
      selectedDocIntents,
      availableIntents
    );
    setSelectedIntent(initial);
    setAffectedResult(null);
    lastResolvedIntentRef.current = null;
  }, [initialStep, initialMode, initialIntent, exec?.activeIntent, selectedDocIntents, availableIntents]);

  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      reset();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, reset]);

  useEffect(() => {
    if (!selectedIntent) {
      const resolved = determineInitialIntent(
        initialIntent,
        exec?.activeIntent,
        selectedDocIntents,
        availableIntents
      );
      if (resolved) {
        setSelectedIntent(resolved);
      }
    }
  }, [initialIntent, exec?.activeIntent, selectedDocIntents, availableIntents, selectedIntent]);

  useEffect(() => {
    if (step === 'auto' && selectedIntent && lastResolvedIntentRef.current !== selectedIntent) {
      resolveAffectedDocs(selectedIntent);
    }
  }, [step, selectedIntent, resolveAffectedDocs]);

  const handleSelectMode = useCallback((newMode: UpdateMode) => {
    setMode(newMode);
  }, []);

  const handleCycleMode = useCallback(() => {
    setMode((prev) => (prev === 'direct' ? 'auto' : 'direct'));
  }, []);

  const handleCycleIntent = useCallback(
    (direction: 1 | -1 = 1) => {
      if (availableIntents.length === 0) return;
      const currentIdx = availableIntents.indexOf(selectedIntent);
      const nextIdx =
        currentIdx === -1
          ? 0
          : (currentIdx + direction + availableIntents.length) % availableIntents.length;
      const nextIntent = availableIntents[nextIdx];
      setSelectedIntent(nextIntent);
      if (step === 'auto') {
        resolveAffectedDocs(nextIntent);
      }
    },
    [availableIntents, selectedIntent, step, resolveAffectedDocs]
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
        resolveAffectedDocs(selectedIntent);
        setAutoSelectedIndex(0);
      }
      return;
    }

    if (step === 'direct') {
      await onConfirmDirect?.(targetDocName, selectedIntent);
      await onConfirm?.({
        mode: 'direct',
        docName: targetDocName,
        intentName: selectedIntent,
      });
      return;
    }

    if (step === 'auto') {
      if (affectedResult?.kind !== 'affected-docs' || affectedDocs.length === 0) {
        return;
      }
      await onConfirmAuto?.(selectedIntent, selectedAutoTarget, affectedDocs);
      await onConfirm?.({
        mode: 'auto',
        intentName: selectedIntent,
        target: selectedAutoTarget,
        affectedDocs,
      });
      return;
    }
  }, [
    step,
    mode,
    selectedIntent,
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
      lastResolvedIntentRef.current = null;
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
    selectedIntent,
    setSelectedIntent,
    availableIntents,
    handleCycleIntent,
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
