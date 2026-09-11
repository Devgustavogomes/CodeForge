import { AppContainer } from '../../../../../infrastructure/container.js';
import { PullSpecUseCase } from '../../../../../application/use-cases/PullSpecUseCase.js';
import { SpecReference } from '../../../../../domain/spec-source.js';

export const PULL_SPEC_PROVIDERS = ['github', 'linear', 'clickup', 'filesystem'] as const;
export type PullSpecProvider = (typeof PULL_SPEC_PROVIDERS)[number];
export type PullSpecFocusedField = 'provider' | 'id' | 'name';

export interface UsePullSpecModalOptions {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (specName: string, filePath: string) => void;
  container?: AppContainer;
  pullSpecUseCase?: PullSpecUseCase;
  defaultProvider?: string;
}

export interface UsePullSpecModalReturn {
  providerIndex: number;
  setProviderIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedProvider: PullSpecProvider;
  providers: readonly PullSpecProvider[];
  activeField: PullSpecFocusedField;
  setActiveField: React.Dispatch<React.SetStateAction<PullSpecFocusedField>>;
  items: SpecReference[];
  selectedItemIndex: number;
  setSelectedItemIndex: React.Dispatch<React.SetStateAction<number>>;
  isFetchingItems: boolean;
  isManualInput: boolean;
  setIsManualInput: React.Dispatch<React.SetStateAction<boolean>>;
  specId: string;
  setSpecId: (val: string) => void;
  customName: string;
  setCustomName: (val: string) => void;
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  isLoading: boolean;
  handleClose: () => void;
  handleSubmit: () => Promise<void>;
}
