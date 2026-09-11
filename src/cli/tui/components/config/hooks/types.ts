import {
  HookEvent,
  HookType,
  HookDefinition,
  HookMap,
} from '../../../../../domain/hook.js';
import { HookFormField } from '../components/HookForm.js';
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
