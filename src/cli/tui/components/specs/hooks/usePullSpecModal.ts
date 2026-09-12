import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { NavigationContext } from '../../../context/NavigationContext.js';
import {
  PullSpecUseCase,
  PullSpecResult,
} from '../../../../../application/use-cases/PullSpecUseCase.js';
import { SpecSourceFactory } from '../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import { createAppContainer } from '../../../../../infrastructure/container.js';
import {
  SpecSourceConfig,
  SpecReference,
} from '../../../../../domain/spec-source.js';
import { useTextInput } from '../../../hooks/useTextInput.js';
import { usePullSpecKeyboard } from './usePullSpecKeyboard.js';
import {
  PullSpecFocusedField,
  UsePullSpecModalOptions,
  UsePullSpecModalReturn,
} from './types.js';

export * from './types.js';

/**
 * Headless hook that manages state, remote data querying, text input editing,
 * and use case submission for PullSpecModal.
 *
 * The provider is read from config.yaml (specSource.provider) and is NOT
 * user-selectable within the modal — matching CLI behavior.
 */
export function usePullSpecModal({
  isOpen = true,
  onClose,
  onSuccess,
  container,
  pullSpecUseCase,
  defaultProvider,
}: UsePullSpecModalOptions): UsePullSpecModalReturn {
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
    defaultProvider || config?.specSource?.provider || 'github';

  const [items, setItems] = useState<SpecReference[]>([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isFetchingItems, setIsFetchingItems] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [activeField, setActiveField] = useState<PullSpecFocusedField>('id');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Headless customName input
  const customNameInput = useTextInput({
    initialValue: '',
    isActive: isOpen && activeField === 'name',
    syncNavigation: false,
    onChange: () => setErrorMessage(null),
  });

  // Headless specId input for manual typing mode
  const specIdInput = useTextInput({
    initialValue: '',
    isActive: isOpen && activeField === 'id' && (isManualInput || items.length === 0),
    syncNavigation: false,
    onChange: () => setErrorMessage(null),
  });

  const specId = specIdInput.value;
  const customName = customNameInput.value;

  // Remote fetch whenever modal opens (provider comes from config)
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setIsFetchingItems(true);
    setErrorMessage(null);

    const specSourceConfig: SpecSourceConfig = {
      ...(config?.specSource ?? {}),
      provider: selectedProvider,
    };

    try {
      const source = SpecSourceFactory.create(selectedProvider, specSourceConfig);
      source
        .list({ limit: 10 })
        .then((list) => {
          if (!isCancelled) {
            const safeList = Array.isArray(list) ? list : [];
            setItems(safeList);
            setIsFetchingItems(false);
            if (safeList.length > 0) {
              setSelectedItemIndex(0);
              specIdInput.setValue(safeList[0].id);
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
    let finalId = specId.trim();
    if (
      !isManualInput &&
      items.length > 0 &&
      selectedItemIndex < items.length
    ) {
      finalId = items[selectedItemIndex].id;
    }

    if (!finalId) {
      setErrorMessage('Spec ID / URL / issue number is required.');
      setActiveField('id');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const specSourceConfig: SpecSourceConfig = {
        ...(config?.specSource ?? {}),
        provider: selectedProvider,
      };

      const specSource = SpecSourceFactory.create(selectedProvider, specSourceConfig);
      const useCase =
        pullSpecUseCase ?? new PullSpecUseCase(appContainer.gw, specSource);

      const result: PullSpecResult = await useCase.execute({
        id: finalId,
        customName: customName.trim() || undefined,
        specSource,
      });

      if (result.kind === 'not-initialized') {
        setErrorMessage(
          'Workspace not initialized (.codeforge/metadata.json not found).',
        );
        setIsLoading(false);
        return;
      }

      if (result.kind === 'fetch-failed' || result.kind === 'error') {
        setErrorMessage(result.error || 'Failed to pull specification.');
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
    specId,
    isManualInput,
    items,
    selectedItemIndex,
    selectedProvider,
    config,
    appContainer,
    pullSpecUseCase,
    customName,
    onSuccess,
    handleClose,
    nav,
  ]);

  usePullSpecKeyboard({
    isOpen,
    isLoading,
    activeField,
    setActiveField,
    items,
    selectedItemIndex,
    setSelectedItemIndex,
    isManualInput,
    setIsManualInput,
    specId,
    setSpecId: specIdInput.setValue,
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
    specId,
    setSpecId: specIdInput.setValue,
    customName,
    setCustomName: customNameInput.setValue,
    errorMessage,
    setErrorMessage,
    isLoading,
    handleClose,
    handleSubmit,
  };
}
