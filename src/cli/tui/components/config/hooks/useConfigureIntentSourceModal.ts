import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { IntentSourceConfig } from '../../../../../domain/intent-source.js';
import { IntentSourceFactory } from '../../../../../infrastructure/intent-sources/IntentSourceFactory.js';
import {
  IntentSourceFormField,
  INTENT_SOURCE_FORM_FIELDS,
} from '../components/IntentSourceForm.js';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { ConfigService } from '../../../../../config/ConfigService.js';
import { useTextInput } from '../../../hooks/useTextInput.js';

export interface UseConfigureIntentSourceModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateIntentSource?: (intentSource: IntentSourceConfig) => void;  availableProviders?: string[];
  formFields?: IntentSourceFormField[];
}
export interface UseConfigureIntentSourceModalReturn {
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
  activeFormField: IntentSourceFormField;
  formErrorMessage: string | null;
  setFormErrorMessage: (msg: string | null) => void;
  feedbackMessage: string | null;
  setFeedbackMessage: (msg: string | null) => void;
  availableProviders: string[];
  saveIntentSource: () => boolean;  cycleProvider: (direction: 1 | -1) => void;
}
function isDefaultOrEnvApiKey(key: string): boolean {
  if (!key || !key.trim()) return true;
  const trimmed = key.trim();
  for (const p of IntentSourceFactory.getAvailableProviders()) {
    if (
      trimmed === IntentSourceFactory.getDefaultApiKey(p) ||
      trimmed === IntentSourceFactory.getDefaultEnvVar(p) ||
      trimmed === `$${IntentSourceFactory.getDefaultEnvVar(p)}` ||
      trimmed === `\${${IntentSourceFactory.getDefaultEnvVar(p)}}`
    ) {
      return true;
    }
  }
  return false;
}

export function useConfigureIntentSourceModal({
  isOpen = true,
  onClose,
  config,
  configService,
  onUpdateIntentSource,
    availableProviders: requestedProviders,
  formFields = INTENT_SOURCE_FORM_FIELDS,
}: UseConfigureIntentSourceModalOptions): UseConfigureIntentSourceModalReturn {
  const nav = useContext(NavigationContext);

  const availableProviders = useMemo(() => {
    return requestedProviders ?? IntentSourceFactory.getAvailableProviders();
  }, [requestedProviders]);

  const currentConfigIntentSource = useMemo(
    () => configService?.loadConfig({ interpolate: false })?.intentSource ?? config?.intentSource,
    [configService, config?.intentSource, isOpen],
  );

  const initialProvider = currentConfigIntentSource?.provider || 'filesystem';
  const [provider, setProvider] = useState<string>(initialProvider);
  const [project, setProject] = useState<string>(
    () => (currentConfigIntentSource?.project as string | undefined) || '',
  );
  const [team, setTeam] = useState<string>(
    () => (currentConfigIntentSource?.team as string | undefined) || '',
  );
  const [apiKey, setApiKey] = useState<string>(
    () =>
      (currentConfigIntentSource?.apiKey as string | undefined) ||
      IntentSourceFactory.getDefaultApiKey(initialProvider),
  );
  const [hasCustomApiKey, setHasCustomApiKey] = useState<boolean>(() => {
    const initialKey = currentConfigIntentSource?.apiKey as string | undefined;
    return Boolean(initialKey && !isDefaultOrEnvApiKey(initialKey));
  });

  const [activeFormFieldIndex, setActiveFormFieldIndex] = useState<number>(0);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const activeFormField: IntentSourceFormField =
    formFields[activeFormFieldIndex] ?? formFields[0] ?? 'provider';

  const saveIntentSource = useCallback((): boolean => {
    const trimmedProvider = provider.trim() || 'filesystem';
    const trimmedProject = project.trim();
    const trimmedTeam = team.trim();
    const defaultApiKey = IntentSourceFactory.getDefaultApiKey(trimmedProvider);
    const trimmedApiKey = apiKey.trim() || defaultApiKey;

    const updatedIntentSource: IntentSourceConfig = {
      provider: trimmedProvider,
      ...(trimmedProject ? { project: trimmedProject } : {}),
      ...(trimmedTeam ? { team: trimmedTeam } : {}),
      ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
    };

    if (configService) {
      try {
        configService.saveConfig({
          ...(config || {}),
          intentSource: updatedIntentSource,
        });
        setFeedbackMessage('✔ Intent Source salvo com sucesso no config.yaml');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setFeedbackMessage(`✗ Erro ao salvar intent source: ${msg}`);
      }
    } else {
      setFeedbackMessage('✔ Intent Source salvo com sucesso');
    }

    const updateCallback = onUpdateIntentSource;
    updateCallback?.(updatedIntentSource);
    onClose?.();
    return true;
  }, [provider, project, team, apiKey, configService, config, onUpdateIntentSource, onUpdateIntentSource, onClose]);

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

  const handleApiKeyChange = useCallback((newKey: string) => {
    setApiKey(newKey);
    setHasCustomApiKey(!isDefaultOrEnvApiKey(newKey));
  }, []);

  const apiKeyInput = useTextInput({
    initialValue: apiKey,
    isActive: isOpen && activeFormField === 'apiKey',
    syncNavigation: false,
    onChange: handleApiKeyChange,
  });

  // Sincronizar campos quando o modal abre ou config muda
  useEffect(() => {
    if (isOpen) {
      const source = currentConfigIntentSource;
      const currentProvider = source?.provider || 'filesystem';
      setProvider(currentProvider);
      const proj = (source?.project as string | undefined) || '';
      setProject(proj);
      projectInput.setValue(proj);
      const tm = (source?.team as string | undefined) || '';
      setTeam(tm);
      teamInput.setValue(tm);
      const key =
        (source?.apiKey as string | undefined) ||
        IntentSourceFactory.getDefaultApiKey(currentProvider);
      setApiKey(key);
      apiKeyInput.setValue(key);
      setHasCustomApiKey(Boolean(key && !isDefaultOrEnvApiKey(key)));

      setActiveFormFieldIndex(0);
      setFormErrorMessage(null);
      setFeedbackMessage(null);
    }
  }, [isOpen, currentConfigIntentSource]);

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

      if (!hasCustomApiKey || isDefaultOrEnvApiKey(apiKey)) {
        const nextDefault = IntentSourceFactory.getDefaultApiKey(nextProvider);
        setApiKey(nextDefault);
        apiKeyInput.setValue(nextDefault);
        setHasCustomApiKey(false);
      }

      setProvider(nextProvider);
    },
    [availableProviders, provider, apiKey, apiKeyInput, hasCustomApiKey],
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
        saveIntentSource();
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
          saveIntentSource();
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
    saveIntentSource,    cycleProvider,
  };
}

export default useConfigureIntentSourceModal;
