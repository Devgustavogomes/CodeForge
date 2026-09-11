import { useState, useEffect, useCallback, useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';
import {
  HookDefinition,
  HookMap,
} from '../../../../../domain/hook.js';
import { useHooksEventsView } from './useHooksEventsView.js';
import { useHooksCommandsView } from './useHooksCommandsView.js';
import { useHookFormState } from './useHookFormState.js';
import {
  ConfigureHooksView,
  UseConfigureHooksModalOptions,
  UseConfigureHooksModalReturn,
} from './types.js';

export * from './types.js';
export { deriveHookName } from './useHookFormState.js';

/**
 * Orchestrator hook for ConfigureHooksModal.
 * Decomposes logic into sub-hooks (useHooksEventsView, useHooksCommandsView, useHookFormState),
 * managing view transitions, immediate auto-save in ConfigService, and feedback.
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
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [hooks, setHooks] = useState<HookMap>(() => config?.hooks || {});

  // Sync hooks if external config updates
  useEffect(() => {
    if (config?.hooks) {
      setHooks(config.hooks);
    }
  }, [config?.hooks]);

  // Temporary feedback timeout
  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  // Sub-hook 1: Events View (Nível 1)
  const eventsView = useHooksEventsView({
    isActive: isOpen && view === 'events',
    onSelectEvent: () => {
      setView('commands');
      commandsView.setSelectedCommandIndex(0);
      commandsView.setDeleteConfirmIndex(null);
    },
    onClose,
  });

  const selectedEvent = eventsView.selectedEvent;
  const commands: HookDefinition[] = hooks[selectedEvent] || [];

  // Sub-hook 3: Form State (Nível 3)
  const formState = useHookFormState({
    isActive: isOpen && view === 'form',
    onSave: () => {
      saveHook();
    },
  });

  const startAddHook = useCallback(() => {
    formState.initAddForm();
    setView('form');
  }, [formState]);

  const startEditHook = useCallback(
    (index: number) => {
      const currentList = hooks[selectedEvent] || [];
      const cmd = currentList[index];
      if (!cmd) return;
      formState.initEditForm(index, cmd);
      setView('form');
    },
    [hooks, selectedEvent, formState]
  );

  const saveHook = useCallback((): boolean => {
    const hookDef = formState.buildHookDefinition(selectedEvent);
    if (!hookDef) {
      return false;
    }

    const currentList = [...(hooks[selectedEvent] || [])];
    if (formState.editingCommandIndex !== null) {
      const existing = currentList[formState.editingCommandIndex];
      if (existing?.timeout !== undefined) {
        hookDef.timeout = existing.timeout;
      }
      currentList[formState.editingCommandIndex] = hookDef;
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
      formState.editingCommandIndex !== null
        ? formState.editingCommandIndex + 1
        : currentList.length;
    commandsView.setSelectedCommandIndex(targetIndex);
    formState.setEditingCommandIndex(null);
    formState.setFormErrorMessage(null);
    setView('commands');
    return true;
  }, [
    formState,
    selectedEvent,
    hooks,
    configService,
    config,
    onUpdateHooks,
  ]);

  const deleteHook = useCallback(
    (indexToDelete: number) => {
      const currentList = [...(hooks[selectedEvent] || [])];
      if (indexToDelete < 0 || indexToDelete >= currentList.length) {
        commandsView.setDeleteConfirmIndex(null);
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

      commandsView.setDeleteConfirmIndex(null);
      commandsView.setSelectedCommandIndex((prev) => {
        const maxIndex = currentList.length;
        return prev > maxIndex ? maxIndex : prev;
      });
    },
    [hooks, selectedEvent, configService, config, onUpdateHooks]
  );

  // Sub-hook 2: Commands View (Nível 2)
  const commandsView = useHooksCommandsView({
    isActive: isOpen && view === 'commands',
    commands,
    onAdd: startAddHook,
    onEdit: startEditHook,
    onDeleteConfirm: (idx) => deleteHook(idx),
    onBack: () => {
      setView('events');
      commandsView.setSelectedCommandIndex(0);
    },
  });

  const handleEsc = useCallback(() => {
    if (view === 'form') {
      setView('commands');
      formState.setFormErrorMessage(null);
      formState.setEditingCommandIndex(null);
    } else if (view === 'commands') {
      if (commandsView.deleteConfirmIndex !== null) {
        commandsView.setDeleteConfirmIndex(null);
      } else {
        setView('events');
        commandsView.setSelectedCommandIndex(0);
      }
    } else if (view === 'events') {
      onClose?.();
    }
  }, [view, commandsView, formState, onClose]);

  // Sync text input active in navigation context
  useEffect(() => {
    if (
      isOpen &&
      view === 'form' &&
      (formState.activeFormField === 'run' || formState.activeFormField === 'name')
    ) {
      nav?.setTextInputActive?.(true);
    } else {
      nav?.setTextInputActive?.(false);
    }
    return () => {
      nav?.setTextInputActive?.(false);
    };
  }, [isOpen, view, formState.activeFormField, nav]);

  // Global Esc navigation
  useInput(
    (input, key) => {
      if (key.escape || input === '\u001B') {
        handleEsc();
        return;
      }
    },
    { isActive: isOpen }
  );

  // Reset modal state on reopen
  useEffect(() => {
    if (isOpen) {
      setView('events');
      eventsView.resetEventsView();
      commandsView.resetCommandsView();
      formState.initAddForm();
      if (config?.hooks) {
        setHooks(config.hooks);
      }
    } else {
      setFeedbackMessage(null);
    }
  }, [isOpen]);

  return {
    view,
    setView,
    selectedEventIndex: eventsView.selectedEventIndex,
    setSelectedEventIndex: eventsView.setSelectedEventIndex,
    selectedEvent,
    selectedCommandIndex: commandsView.selectedCommandIndex,
    setSelectedCommandIndex: commandsView.setSelectedCommandIndex,
    commands,
    editingCommandIndex: formState.editingCommandIndex,
    isEditing: formState.isEditing,
    run: formState.run,
    setRun: formState.setRun,
    type: formState.type,
    setType: formState.setType,
    name: formState.name,
    setName: formState.setName,
    activeFormFieldIndex: formState.activeFormFieldIndex,
    setActiveFormFieldIndex: formState.setActiveFormFieldIndex,
    activeFormField: formState.activeFormField,
    formErrorMessage: formState.formErrorMessage,
    setFormErrorMessage: formState.setFormErrorMessage,
    deleteConfirmIndex: commandsView.deleteConfirmIndex,
    setDeleteConfirmIndex: commandsView.setDeleteConfirmIndex,
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
