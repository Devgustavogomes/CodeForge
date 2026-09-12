import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { SpecSourceConfig } from '../../../../../domain/spec-source.js';
import { SpecSourceFactory } from '../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import {
  SpecSourceFormField,
  SPEC_SOURCE_FORM_FIELDS,
} from '../components/SpecSourceForm.js';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { ConfigService } from '../../../../../config/ConfigService.js';
import { useTextInput } from '../../../hooks/useTextInput.js';

export interface UseConfigureSpecSourceModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateSpecSource?: (specSource: SpecSourceConfig) => void;
  availableProviders?: string[];
  formFields?: SpecSourceFormField[];
}

export interface UseConfigureSpecSourceModalReturn {
  provider: string;
  setProvider: (p: string | ((prev: string) => string)) => void;
  project: string;
  setProject: (p: string | ((prev: string) => string)) => void;
  team: string;
  setTeam: (t: string | ((prev: string) => string)) => void;
  apiKey: string;
  setApiKey: (k: string | ((prev: string) => string)) => void;
  activeFormFieldIndex: number;
  setActiveFormFieldIndex: (idx: number | ((prev: number) => number)) => void;
  activeFormField: SpecSourceFormField;
  formErrorMessage: string | null;
  setFormErrorMessage: (msg: string | null) => void;
  feedbackMessage: string | null;
  setFeedbackMessage: (msg: string | null) => void;
  availableProviders: string[];
  saveSpecSource: () => boolean;
  cycleProvider: (direction: 1 | -1) => void;
}

export function useConfigureSpecSourceModal({
  isOpen = true,
  onClose,
  config,
  configService,
  onUpdateSpecSource,
  availableProviders: requestedProviders,
  formFields = SPEC_SOURCE_FORM_FIELDS,
}: UseConfigureSpecSourceModalOptions): UseConfigureSpecSourceModalReturn {
  const nav = useContext(NavigationContext);

  const availableProviders = useMemo(() => {
    return requestedProviders ?? SpecSourceFactory.getAvailableProviders();
  }, [requestedProviders]);

  const initialProvider = config?.specSource?.provider || 'filesystem';
  const [provider, setProvider] = useState<string>(initialProvider);
  const [project, setProject] = useState<string>(
    () => (config?.specSource?.project as string | undefined) || '',
  );
  const [team, setTeam] = useState<string>(
    () => (config?.specSource?.team as string | undefined) || '',
  );
  const [apiKey, setApiKey] = useState<string>(
    () =>
      (config?.specSource?.apiKey as string | undefined) ||
      SpecSourceFactory.getDefaultApiKey(initialProvider),
  );

  const [activeFormFieldIndex, setActiveFormFieldIndex] = useState<number>(0);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const activeFormField: SpecSourceFormField =
    formFields[activeFormFieldIndex] ?? formFields[0] ?? 'provider';

  const saveSpecSource = useCallback((): boolean => {
    const trimmedProvider = provider.trim() || 'filesystem';
    const trimmedProject = project.trim();
    const trimmedTeam = team.trim();
    const defaultApiKey = SpecSourceFactory.getDefaultApiKey(trimmedProvider);
    const trimmedApiKey = apiKey.trim() || defaultApiKey;

    const updatedSpecSource: SpecSourceConfig = {
      provider: trimmedProvider,
      ...(trimmedProject ? { project: trimmedProject } : {}),
      ...(trimmedTeam ? { team: trimmedTeam } : {}),
      ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
    };

    if (configService) {
      try {
        configService.saveConfig({
          ...(config || {}),
          specSource: updatedSpecSource,
        });
        setFeedbackMessage('✔ Spec Source salvo com sucesso no config.yaml');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setFeedbackMessage(`✗ Erro ao salvar spec source: ${msg}`);
      }
    } else {
      setFeedbackMessage('✔ Spec Source salvo com sucesso');
    }

    onUpdateSpecSource?.(updatedSpecSource);
    onClose?.();
    return true;
  }, [provider, project, team, apiKey, configService, config, onUpdateSpecSource, onClose]);

  const projectInput = useTextInput({
    initialValue: project,
    isActive: isOpen && activeFormField === 'project',
    syncNavigation: false,
    onChange: setProject,
  });

  const teamInput = useTextInput({
    initialValue: team,
    isActive: isOpen && activeFormField === 'team',
    syncNavigation: false,
    onChange: setTeam,
  });

  const apiKeyInput = useTextInput({
    initialValue: apiKey,
    isActive: isOpen && activeFormField === 'apiKey',
    syncNavigation: false,
    onChange: setApiKey,
  });

  // Sincronizar campos quando o modal abre ou config muda
  useEffect(() => {
    if (isOpen) {
      const currentProvider = config?.specSource?.provider || 'filesystem';
      setProvider(currentProvider);
      const proj = (config?.specSource?.project as string | undefined) || '';
      setProject(proj);
      projectInput.setValue(proj);
      const tm = (config?.specSource?.team as string | undefined) || '';
      setTeam(tm);
      teamInput.setValue(tm);
      const key =
        (config?.specSource?.apiKey as string | undefined) ||
        SpecSourceFactory.getDefaultApiKey(currentProvider);
      setApiKey(key);
      apiKeyInput.setValue(key);

      setActiveFormFieldIndex(0);
      setFormErrorMessage(null);
      setFeedbackMessage(null);
    }
  }, [isOpen, config?.specSource]);

  // Sincronizar foco de digitação com o NavigationContext
  useEffect(() => {
    if (
      isOpen &&
      (activeFormField === 'project' ||
        activeFormField === 'team' ||
        activeFormField === 'apiKey')
    ) {
      nav?.setTextInputActive?.(true);
    } else {
      nav?.setTextInputActive?.(false);
    }
    return () => {
      nav?.setTextInputActive?.(false);
    };
  }, [isOpen, activeFormField, nav]);

  const cycleProvider = useCallback(
    (direction: 1 | -1 = 1) => {
      const currentIdx = availableProviders.indexOf(provider.toLowerCase());
      const safeIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx =
        (safeIdx + direction + availableProviders.length) %
        availableProviders.length;
      const nextProvider = availableProviders[nextIdx];
      const prevDefault = SpecSourceFactory.getDefaultApiKey(provider);

      if (!apiKey || apiKey === prevDefault) {
        const nextDefault = SpecSourceFactory.getDefaultApiKey(nextProvider);
        setApiKey(nextDefault);
        apiKeyInput.setValue(nextDefault);
      }

      setProvider(nextProvider);
    },
    [availableProviders, provider, apiKey, apiKeyInput],
  );

  // Captura de teclado do formulário para navegação entre campos e controles
  useInput(
    (input, key) => {
      if (!isOpen) return;

      // Tecla Esc: fechar modal
      if (key.escape || input === '\u001B') {
        onClose?.();
        return;
      }

      // Navegação entre campos do formulário
      const isTab = (key.tab && !key.shift) || input === '\t';
      const isShiftTab = (key.tab && key.shift) || input === '\x1b[Z';

      if (isShiftTab || key.upArrow) {
        setActiveFormFieldIndex((prev) =>
          (prev - 1 + formFields.length) % formFields.length,
        );
        return;
      }

      if (isTab || key.downArrow) {
        setActiveFormFieldIndex((prev) =>
          (prev + 1) % formFields.length,
        );
        return;
      }

      // Submissão do formulário com Enter
      if (key.return || input === '\r' || input === '\n') {
        saveSpecSource();
        return;
      }

      // Campo 1: Provedor (provider)
      if (activeFormField === 'provider') {
        if (input === ' ' || key.rightArrow) {
          cycleProvider(1);
          return;
        }
        if (key.leftArrow) {
          cycleProvider(-1);
          return;
        }
        return;
      }

      // Campo 5: Botão Salvar (save)
      if (activeFormField === 'save') {
        if (input === ' ') {
          saveSpecSource();
          return;
        }
        return;
      }
    },
    { isActive: isOpen },
  );

  return {
    provider,
    setProvider,
    project,
    setProject: projectInput.setValue,
    team,
    setTeam: teamInput.setValue,
    apiKey,
    setApiKey: apiKeyInput.setValue,
    activeFormFieldIndex,
    setActiveFormFieldIndex,
    activeFormField,
    formErrorMessage,
    setFormErrorMessage,
    feedbackMessage,
    setFeedbackMessage,
    availableProviders,
    saveSpecSource,
    cycleProvider,
  };
}
