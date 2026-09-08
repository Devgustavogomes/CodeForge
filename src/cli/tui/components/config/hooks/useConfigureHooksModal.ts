import { useState, useEffect, useCallback, useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';
import {
  HOOK_EVENTS,
  HookEvent,
  HookType,
  HookDefinition,
  HookMap,
} from '../../../../../domain/hook.js';
import {
  HookFormField,
  HOOK_FORM_FIELDS,
} from '../components/HookForm.js';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { ConfigService } from '../../../../../config/ConfigService.js';

export type ConfigureHooksView = 'events' | 'commands' | 'form';

export interface UseConfigureHooksModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
  config?: CodeForgeConfig;
  configService?: ConfigService;
  onUpdateHooks?: (hooks: HookMap) => void;
}

/**
 * Deriva um identificador (name) amigável e limpo para o hook caso omitido.
 * Utiliza o primeiro termo do comando executável ou um fallback baseado no evento e timestamp.
 */
export function deriveHookName(run: string, event: HookEvent): string {
  const trimmed = run.trim();
  if (!trimmed) {
    return `${event}-hook-${Date.now()}`;
  }
  const firstTerm = trimmed
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');

  if (firstTerm.length > 0) {
    return firstTerm;
  }
  return `${event}-hook-${Date.now()}`;
}

export interface UseConfigureHooksModalReturn {
  view: ConfigureHooksView;
  setView: (view: ConfigureHooksView) => void;
  selectedEventIndex: number;
  setSelectedEventIndex: (idx: number | ((prev: number) => number)) => void;
  selectedEvent: HookEvent;
  selectedCommandIndex: number;
  setSelectedCommandIndex: (idx: number | ((prev: number) => number)) => void;
  commands: HookDefinition[];
  editingCommandIndex: number | null;
  isEditing: boolean;
  run: string;
  setRun: (val: string | ((prev: string) => string)) => void;
  type: HookType;
  setType: (type: HookType | ((prev: HookType) => HookType)) => void;
  name: string;
  setName: (val: string | ((prev: string) => string)) => void;
  activeFormFieldIndex: number;
  setActiveFormFieldIndex: (idx: number | ((prev: number) => number)) => void;
  activeFormField: HookFormField;
  formErrorMessage: string | null;
  setFormErrorMessage: (msg: string | null) => void;
  deleteConfirmIndex: number | null;
  setDeleteConfirmIndex: (idx: number | null) => void;
  feedbackMessage: string | null;
  setFeedbackMessage: (msg: string | null) => void;
  hooks: HookMap;
  saveHook: () => boolean;
  deleteHook: (index: number) => void;
  startAddHook: () => void;
  startEditHook: (index: number) => void;
  handleEsc: () => void;
}

/**
 * Hook de controle de estado e atalhos de teclado do ConfigureHooksModal.
 * Gerencia navegação hierárquica (Nível 1: events -> Nível 2: commands -> Nível 3: form),
 * auto-save imediato no configService e feedback visual.
 */
export function useConfigureHooksModal({
  isOpen = true,
  onClose,
  config,
  configService,
  onUpdateHooks,
}: UseConfigureHooksModalOptions): UseConfigureHooksModalReturn {
  const nav = useContext(NavigationContext);

  const [view, setView] = useState<ConfigureHooksView>('events');
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState<number>(0);
  const [editingCommandIndex, setEditingCommandIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Campos do formulário (Nível 3)
  const [run, setRun] = useState<string>('');
  const [type, setType] = useState<HookType>('notify');
  const [name, setName] = useState<string>('');
  const [activeFormFieldIndex, setActiveFormFieldIndex] = useState<number>(0);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

  // Feedback temporário
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Estado local de hooks
  const [hooks, setHooks] = useState<HookMap>(() => config?.hooks || {});

  // Sincronizar hooks caso config.hooks mude externamente
  useEffect(() => {
    if (config?.hooks) {
      setHooks(config.hooks);
    }
  }, [config?.hooks]);

  // Resetar modal ao reabrir
  useEffect(() => {
    if (isOpen) {
      setView('events');
      setSelectedEventIndex(0);
      setSelectedCommandIndex(0);
      setEditingCommandIndex(null);
      setDeleteConfirmIndex(null);
      setFormErrorMessage(null);
      if (config?.hooks) {
        setHooks(config.hooks);
      }
    } else {
      setFeedbackMessage(null);
    }
  }, [isOpen]);

  // Limpar mensagem de feedback após tempo de exibição
  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const activeFormField: HookFormField =
    HOOK_FORM_FIELDS[activeFormFieldIndex] ?? 'run';

  // Sincronizar foco de digitação com o NavigationContext
  useEffect(() => {
    if (
      isOpen &&
      view === 'form' &&
      (activeFormField === 'run' || activeFormField === 'name')
    ) {
      nav?.setTextInputActive?.(true);
    } else {
      nav?.setTextInputActive?.(false);
    }
    return () => {
      nav?.setTextInputActive?.(false);
    };
  }, [isOpen, view, activeFormField, nav]);

  const selectedEvent: HookEvent =
    HOOK_EVENTS[selectedEventIndex] || HOOK_EVENTS[0];
  const commands: HookDefinition[] = hooks[selectedEvent] || [];
  const isEditing = editingCommandIndex !== null;

  const startAddHook = useCallback(() => {
    setEditingCommandIndex(null);
    setRun('');
    setType('notify');
    setName('');
    setActiveFormFieldIndex(0);
    setFormErrorMessage(null);
    setView('form');
  }, []);

  const startEditHook = useCallback(
    (index: number) => {
      const currentList = hooks[selectedEvent] || [];
      const cmd = currentList[index];
      if (!cmd) return;
      setEditingCommandIndex(index);
      setRun(cmd.run);
      setType(cmd.type || 'notify');
      setName(cmd.name || '');
      setActiveFormFieldIndex(0);
      setFormErrorMessage(null);
      setView('form');
    },
    [hooks, selectedEvent]
  );

  const handleEsc = useCallback(() => {
    if (view === 'form') {
      setView('commands');
      setFormErrorMessage(null);
      setEditingCommandIndex(null);
    } else if (view === 'commands') {
      if (deleteConfirmIndex !== null) {
        setDeleteConfirmIndex(null);
      } else {
        setView('events');
        setSelectedCommandIndex(0);
      }
    } else if (view === 'events') {
      onClose?.();
    }
  }, [view, deleteConfirmIndex, onClose]);

  const saveHook = useCallback((): boolean => {
    const trimmedRun = run.trim();
    if (!trimmedRun) {
      setFormErrorMessage('O comando (run) é obrigatório.');
      return false;
    }

    const hookName = name.trim()
      ? name.trim()
      : deriveHookName(trimmedRun, selectedEvent);

    const currentList = [...(hooks[selectedEvent] || [])];
    const hookDef: HookDefinition = {
      name: hookName,
      run: trimmedRun,
      type,
    };

    if (editingCommandIndex !== null) {
      const existing = currentList[editingCommandIndex];
      if (existing?.timeout !== undefined) {
        hookDef.timeout = existing.timeout;
      }
      currentList[editingCommandIndex] = hookDef;
    } else {
      currentList.push(hookDef);
    }

    const updatedHooks: HookMap = {
      ...hooks,
      [selectedEvent]: currentList,
    };

    setHooks(updatedHooks);

    if (configService) {
      try {
        configService.saveConfig({
          ...(config || {}),
          hooks: updatedHooks,
        });
        setFeedbackMessage('✔ Hook salvo com sucesso no config.yaml');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setFeedbackMessage(`✗ Erro ao salvar hook: ${msg}`);
      }
    } else {
      setFeedbackMessage('✔ Hook salvo com sucesso no config.yaml');
    }

    onUpdateHooks?.(updatedHooks);

    const targetIndex =
      editingCommandIndex !== null ? editingCommandIndex + 1 : currentList.length;
    setSelectedCommandIndex(targetIndex);
    setEditingCommandIndex(null);
    setFormErrorMessage(null);
    setView('commands');
    return true;
  }, [
    run,
    name,
    type,
    selectedEvent,
    hooks,
    editingCommandIndex,
    configService,
    config,
    onUpdateHooks,
  ]);

  const deleteHook = useCallback(
    (indexToDelete: number) => {
      const currentList = [...(hooks[selectedEvent] || [])];
      if (indexToDelete < 0 || indexToDelete >= currentList.length) {
        setDeleteConfirmIndex(null);
        return;
      }

      currentList.splice(indexToDelete, 1);

      const updatedHooks: HookMap = {
        ...hooks,
        [selectedEvent]: currentList,
      };

      setHooks(updatedHooks);

      if (configService) {
        try {
          configService.saveConfig({
            ...(config || {}),
            hooks: updatedHooks,
          });
          setFeedbackMessage('✔ Hook removido com sucesso');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setFeedbackMessage(`✗ Erro ao remover hook: ${msg}`);
        }
      } else {
        setFeedbackMessage('✔ Hook removido com sucesso');
      }

      onUpdateHooks?.(updatedHooks);

      setDeleteConfirmIndex(null);
      setSelectedCommandIndex((prev) => {
        const maxIndex = currentList.length;
        return prev > maxIndex ? maxIndex : prev;
      });
    },
    [hooks, selectedEvent, configService, config, onUpdateHooks]
  );

  // Captura de teclado para todas as visões
  useInput(
    (input, key) => {
      // Tecla Esc: navegação reversa (Form -> Commands -> Events -> Fechar Modal)
      if (key.escape || input === '\u001B') {
        handleEsc();
        return;
      }

      // ──────────────────────────────────────────
      // NÍVEL 1: LISTA DE EVENTOS (view === 'events')
      // ──────────────────────────────────────────
      if (view === 'events') {
        if (input === 'q' || input === 'Q') {
          onClose?.();
          return;
        }

        if (key.upArrow || input === 'k' || input === 'K') {
          setSelectedEventIndex((prev) =>
            prev > 0 ? prev - 1 : HOOK_EVENTS.length - 1
          );
          return;
        }

        if (key.downArrow || input === 'j' || input === 'J') {
          setSelectedEventIndex((prev) =>
            prev < HOOK_EVENTS.length - 1 ? prev + 1 : 0
          );
          return;
        }

        if (key.return || input === '\r' || input === '\n' || key.rightArrow) {
          setView('commands');
          setSelectedCommandIndex(0);
          setDeleteConfirmIndex(null);
          return;
        }

        return;
      }

      // ──────────────────────────────────────────
      // NÍVEL 2: LISTA DE COMANDOS (view === 'commands')
      // ──────────────────────────────────────────
      if (view === 'commands') {
        const currentList = hooks[selectedEvent] || [];
        const totalItems = currentList.length;

        // Sub-estado de confirmação de exclusão
        if (deleteConfirmIndex !== null) {
          if (input === 'y' || input === 'Y') {
            deleteHook(deleteConfirmIndex);
            return;
          }
          if (input === 'n' || input === 'N') {
            setDeleteConfirmIndex(null);
            return;
          }
          return;
        }

        // Navegação de retorno para Nível 1 com seta para a esquerda
        if (key.leftArrow) {
          setView('events');
          setSelectedCommandIndex(0);
          return;
        }

        if (key.upArrow || input === 'k' || input === 'K') {
          setSelectedCommandIndex((prev) =>
            prev > 0 ? prev - 1 : totalItems
          );
          return;
        }

        if (key.downArrow || input === 'j' || input === 'J') {
          setSelectedCommandIndex((prev) =>
            prev < totalItems ? prev + 1 : 0
          );
          return;
        }

        if (key.return || input === '\r' || input === '\n') {
          if (selectedCommandIndex === 0) {
            startAddHook();
          } else {
            startEditHook(selectedCommandIndex - 1);
          }
          return;
        }

        if (input === 'e' || input === 'E') {
          if (selectedCommandIndex > 0) {
            startEditHook(selectedCommandIndex - 1);
          }
          return;
        }

        if (input === 'd' || input === 'D' || key.delete) {
          if (selectedCommandIndex > 0) {
            setDeleteConfirmIndex(selectedCommandIndex - 1);
          }
          return;
        }

        return;
      }

      // ──────────────────────────────────────────
      // NÍVEL 3: FORMULÁRIO (view === 'form')
      // ──────────────────────────────────────────
      if (view === 'form') {
        const currentField = HOOK_FORM_FIELDS[activeFormFieldIndex];

        // Navegação entre campos do formulário
        const isTab = (key.tab && !key.shift) || input === '\t';
        const isShiftTab = (key.tab && key.shift) || input === '\x1b[Z';

        if (isShiftTab || key.upArrow) {
          setActiveFormFieldIndex((prev) => (prev - 1 + 4) % 4);
          return;
        }

        if (isTab || key.downArrow) {
          setActiveFormFieldIndex((prev) => (prev + 1) % 4);
          return;
        }

        // Submissão do formulário com Enter
        if (key.return || input === '\r' || input === '\n') {
          saveHook();
          return;
        }

        // Campo 2: Tipo (type)
        if (currentField === 'type') {
          if (input === ' ' || key.leftArrow || key.rightArrow) {
            setType((prev) => (prev === 'gate' ? 'notify' : 'gate'));
            return;
          }
          return;
        }

        // Campo 4: Botão Salvar (save)
        if (currentField === 'save') {
          if (input === ' ') {
            saveHook();
            return;
          }
          return;
        }

        // Campo 1: Comando (run)
        if (currentField === 'run') {
          if (
            key.backspace ||
            key.delete ||
            input === '\x08' ||
            input === '\x7f'
          ) {
            setRun((prev) => prev.slice(0, -1));
            setFormErrorMessage(null);
            return;
          }

          if (key.ctrl && input === 'u') {
            setRun('');
            setFormErrorMessage(null);
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
              setRun((prev) => prev + printable);
              setFormErrorMessage(null);
            }
          }
          return;
        }

        // Campo 3: Nome (name)
        if (currentField === 'name') {
          if (
            key.backspace ||
            key.delete ||
            input === '\x08' ||
            input === '\x7f'
          ) {
            setName((prev) => prev.slice(0, -1));
            return;
          }

          if (key.ctrl && input === 'u') {
            setName('');
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
              setName((prev) => prev + printable);
            }
          }
          return;
        }
      }
    },
    { isActive: isOpen }
  );

  return {
    view,
    setView,
    selectedEventIndex,
    setSelectedEventIndex,
    selectedEvent,
    selectedCommandIndex,
    setSelectedCommandIndex,
    commands,
    editingCommandIndex,
    isEditing,
    run,
    setRun,
    type,
    setType,
    name,
    setName,
    activeFormFieldIndex,
    setActiveFormFieldIndex,
    activeFormField,
    formErrorMessage,
    setFormErrorMessage,
    deleteConfirmIndex,
    setDeleteConfirmIndex,
    feedbackMessage,
    setFeedbackMessage,
    hooks,
    saveHook,
    deleteHook,
    startAddHook,
    startEditHook,
    handleEsc,
  };
}
