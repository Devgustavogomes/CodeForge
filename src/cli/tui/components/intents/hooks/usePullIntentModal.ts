import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import {
  PullIntentUseCase,
  PullIntentResult,
} from '../../../../../application/use-cases/PullIntentUseCase.js';
import { IntentSourceFactory } from '../../../../../infrastructure/intent-sources/IntentSourceFactory.js';
import { createAppContainer } from '../../../../../infrastructure/container.js';
import {
  IntentSourceConfig,
  IntentReference,
} from '../../../../../domain/intent-source.js';
import { useTextInput } from '../../../hooks/useTextInput.js';
import { usePullIntentKeyboard } from './usePullIntentKeyboard.js';
import {
  PullIntentFocusedField,
  UsePullIntentModalOptions,
  UsePullIntentModalReturn,
} from './types.js';

export * from './types.js';

/**
 * Headless hook that manages state, remote data querying, text input editing,
 * and use case submission for PullIntentModal.
 *
 * The provider is read from config.yaml (intentSource.provider) and is NOT
 * user-selectable within the modal — matching CLI behavior.
 */
export function usePullIntentModal({
  isOpen = true,
  onClose,
  onSuccess,
  container,
  pullIntentUseCase,
  defaultProvider,
}: UsePullIntentModalOptions): UsePullIntentModalReturn {
  const nav = useContext(NavigationContext);
  const appContainer = useMemo(
    () => container ?? createAppContainer(),
    [container],
  );
  const config = useMemo(() => {
    return appContainer.configService.loadConfig();
  }, [appContainer]);

  // Provider is fixed from config — no user selection
  const selectedProvider =
    defaultProvider ||
    config?.intentSource?.provider ||
    (config as unknown as { intentSource?: { provider?: string } })?.intentSource?.provider ||
    'github';

  const [items, setItems] = useState<IntentReference[]>([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isFetchingItems, setIsFetchingItems] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [activeField, setActiveField] = useState<PullIntentFocusedField>('id');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Headless customName input
  const customNameInput = useTextInput({
    initialValue: '',
    isActive: isOpen && activeField === 'name',
    syncNavigation: false,
    onChange: () => setErrorMessage(null),
  });

  // Headless intentId input for manual typing mode
  const intentIdInput = useTextInput({
    initialValue: '',
    isActive: isOpen && activeField === 'id' && (isManualInput || items.length === 0),
    syncNavigation: false,
    onChange: () => setErrorMessage(null),
  });

  const intentId = intentIdInput.value;
  const customName = customNameInput.value;

  // Remote fetch whenever modal opens (provider comes from config)
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setIsFetchingItems(true);
    setErrorMessage(null);

    const intentSourceConfig: IntentSourceConfig = {
      ...(config?.intentSource ?? {}),
      provider: selectedProvider,
    };

    try {
      const source = IntentSourceFactory.create(selectedProvider, intentSourceConfig);
      source
        .list({ limit: 10 })
        .then((list: IntentReference[]) => {
          if (!isCancelled) {
            const safeList = Array.isArray(list) ? list : [];
            setItems(safeList);
            setIsFetchingItems(false);
            if (safeList.length > 0) {
              setSelectedItemIndex(0);
              intentIdInput.setValue(safeList[0].id);
              setIsManualInput(false);
            } else {
              setIsManualInput(true);
            }
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setItems([]);
            setIsFetchingItems(false);
            setIsManualInput(true);
          }
        });
    } catch {
      if (!isCancelled) {
        setItems([]);
        setIsFetchingItems(false);
        setIsManualInput(true);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, selectedProvider, config]);

  const setTextInputActive = nav?.setTextInputActive;

  // Sync navigation text input flag
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsLoading(false);
      setActiveField('id');
      setTextInputActive?.(true);
    } else {
      setTextInputActive?.(false);
    }
    return () => {
      setTextInputActive?.(false);
    };
  }, [isOpen, setTextInputActive]);

  const handleClose = useCallback(() => {
    setErrorMessage(null);
    setIsLoading(false);
    nav?.setTextInputActive?.(false);
    if (onClose) {
      onClose();
    } else {
      nav?.closeModal();
    }
  }, [nav, onClose]);

  const handleSubmit = useCallback(async () => {
    let finalId = intentId.trim();
    if (
      !isManualInput &&
      items.length > 0 &&
      selectedItemIndex < items.length
    ) {
      finalId = items[selectedItemIndex].id;
    }

    if (!finalId) {
      setErrorMessage('Intent ID / URL / issue number is required.');
      setActiveField('id');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const intentSourceConfig: IntentSourceConfig = {
        ...(config?.intentSource ?? {}),
        provider: selectedProvider,
      };

      const intentSource = IntentSourceFactory.create(selectedProvider, intentSourceConfig);
      const useCase =
        pullIntentUseCase ?? new PullIntentUseCase(appContainer.gw, intentSource);

      const result: PullIntentResult = await useCase.execute({
        id: finalId,
        customName: customName.trim() || undefined,
        intentSource,
      });

      if (result.kind === 'not-initialized') {
        setErrorMessage(
          'Workspace not initialized (.codeforge/metadata.json not found).',
        );
        setIsLoading(false);
        return;
      }

      if (result.kind === 'fetch-failed' || result.kind === 'error') {
        setErrorMessage(result.error || 'Failed to pull intent.');
        setIsLoading(false);
        return;
      }

      if (result.kind === 'success') {
        setIsLoading(false);
        nav?.setTextInputActive?.(false);
        if (onSuccess) {
          onSuccess(result.filename, result.filePath);
        }
        handleClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setIsLoading(false);
    }
  }, [
    intentId,
    isManualInput,
    items,
    selectedItemIndex,
    selectedProvider,
    config,
    appContainer,
    pullIntentUseCase,
    customName,
    onSuccess,
    handleClose,
    nav,
  ]);

  usePullIntentKeyboard({
    isOpen,
    isLoading,
    activeField,
    setActiveField,
    items,
    selectedItemIndex,
    setSelectedItemIndex,
    isManualInput,
    setIsManualInput,
    intentId,
    setIntentId: intentIdInput.setValue,
    setErrorMessage,
    handleClose,
    handleSubmit: () => void handleSubmit(),
  });

  return {
    selectedProvider,
    activeField,
    setActiveField,
    items,
    selectedItemIndex,
    setSelectedItemIndex,
    isFetchingItems,
    isManualInput,
    setIsManualInput,
    intentId,
    setIntentId: intentIdInput.setValue,
    customName,
    setCustomName: customNameInput.setValue,
    errorMessage,
    setErrorMessage,
    isLoading,
    handleClose,
    handleSubmit,
  };
}