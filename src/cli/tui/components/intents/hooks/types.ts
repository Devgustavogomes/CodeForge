import { AppContainer } from '../../../../../infrastructure/container.js';
import { PullIntentUseCase } from '../../../../../application/use-cases/PullIntentUseCase.js';
import { IntentReference } from '../../../../../domain/intent-source.js';

export const PULL_INTENT_PROVIDERS = ['github', 'linear', 'clickup', 'filesystem'] as const;
export type PullIntentProvider = (typeof PULL_INTENT_PROVIDERS)[number];
export type PullIntentFocusedField = 'id' | 'name';

export interface UsePullIntentModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (intentName: string, filePath: string) => void;
  container?: AppContainer;
  pullIntentUseCase?: PullIntentUseCase;
  defaultProvider?: string;
}

export interface UsePullIntentModalReturn {
  selectedProvider: string;
  activeField: PullIntentFocusedField;
  setActiveField: React.Dispatch<React.SetStateAction<PullIntentFocusedField>>;
  items: IntentReference[];
  selectedItemIndex: number;
  setSelectedItemIndex: React.Dispatch<React.SetStateAction<number>>;
  isFetchingItems: boolean;
  isManualInput: boolean;
  setIsManualInput: React.Dispatch<React.SetStateAction<boolean>>;
  intentId: string;
  setIntentId: (val: string) => void;
  customName: string;
  setCustomName: (val: string) => void;
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  isLoading: boolean;
  handleClose: () => void;
  handleSubmit: () => Promise<void>;
}