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

export interface UseConfigureSpecSourceModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateSpecSource?: (specSource: SpecSourceConfig) => void;
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
}: UseConfigureSpecSourceModalOptions): UseConfigureSpecSourceModalReturn {
  const nav = useContext(NavigationContext);

  const availableProviders = useMemo(() => {
    try {
      return SpecSourceFactory.getAvailableProviders();
    } catch {
      return ['filesystem', 'linear', 'github', 'clickup'];
    }
  }, []);

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

  // Sincronizar campos quando o modal abre ou config muda
  useEffect(() => {
    if (isOpen) {
      const currentProvider = config?.specSource?.provider || 'filesystem';
      setProvider(currentProvider);
      setProject((config?.specSource?.project as string | undefined) || '');
      setTeam((config?.specSource?.team as string | undefined) || '');
      setApiKey(
        (config?.specSource?.apiKey as string | undefined) ||
          SpecSourceFactory.getDefaultApiKey(currentProvider),
      );
      setActiveFormFieldIndex(0);
      setFormErrorMessage(null);
      setFeedbackMessage(null);
    }
  }, [isOpen, config?.specSource]);

  const activeFormField: SpecSourceFormField =
    SPEC_SOURCE_FORM_FIELDS[activeFormFieldIndex] ?? 'provider';

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

      // Se o usuário não alterou a apiKey (está vazia ou é o padrão do provedor anterior),
      // atualiza automaticamente para a variável de ambiente padrão do novo provedor
      if (!apiKey || apiKey === prevDefault) {
        setApiKey(SpecSourceFactory.getDefaultApiKey(nextProvider));
      }

      setProvider(nextProvider);
    },
    [availableProviders, provider, apiKey],
  );

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

  // Captura de teclado do formulário
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
          (prev - 1 + SPEC_SOURCE_FORM_FIELDS.length) % SPEC_SOURCE_FORM_FIELDS.length,
        );
        return;
      }

      if (isTab || key.downArrow) {
        setActiveFormFieldIndex((prev) =>
          (prev + 1) % SPEC_SOURCE_FORM_FIELDS.length,
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

      // Campos de Texto (project, team, apiKey)
      const currentSetter =
        activeFormField === 'project'
          ? setProject
          : activeFormField === 'team'
            ? setTeam
            : setApiKey;

      if (
        key.backspace ||
        key.delete ||
        input === '\x08' ||
        input === '\x7f'
      ) {
        currentSetter((prev) => prev.slice(0, -1));
        return;
      }

      if (key.ctrl && input === 'u') {
        currentSetter('');
        return;
      }

      if (!key.ctrl && !key.meta) {
        const printable = input
          .split('')
          .filter((ch) => {
            const code = ch.charCodeAt(0);
            return (code >= 32 && code !== 127) || code > 127;
          })
          .join('');

        if (printable.length > 0) {
          currentSetter((prev) => prev + printable);
        }
      }
    },
    { isActive: isOpen },
  );

  return {
    provider,
    setProvider,
    project,
    setProject,
    team,
    setTeam,
    apiKey,
    setApiKey,
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
