import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type TabId = 'run' | 'specs' | 'tasks' | 'docs' | 'config';

export interface TabItem {
  id: TabId;
  label: string;
  numberKey: string;
}

export const TABS: readonly TabItem[] = [
  { id: 'run', label: 'Run', numberKey: '1' },
  { id: 'specs', label: 'Specs', numberKey: '2' },
  { id: 'tasks', label: 'Tasks', numberKey: '3' },
  { id: 'docs', label: 'Docs', numberKey: '4' },
  { id: 'config', label: 'Config', numberKey: '5' },
] as const;

export const TAB_ORDER: readonly TabId[] = ['run', 'specs', 'tasks', 'docs', 'config'] as const;

export interface ModalState {
  type: string;
  props?: Record<string, unknown>;
}

export interface NavigationContextValue {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  nextTab: () => void;
  prevTab: () => void;

  modal: ModalState | null;
  openModal: (type: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;

  isTextInputActive: boolean;
  setTextInputActive: (active: boolean) => void;
}

export interface NavigationProviderProps {
  children: ReactNode;
  initialTab?: TabId;
}

export const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  initialTab = 'specs',
}) => {
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [isTextInputActive, setTextInputActive] = useState(false);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
  }, []);

  const nextTab = useCallback(() => {
    setActiveTabState((current) => {
      const idx = TAB_ORDER.indexOf(current);
      const nextIdx = (idx + 1) % TAB_ORDER.length;
      return TAB_ORDER[nextIdx];
    });
  }, []);

  const prevTab = useCallback(() => {
    setActiveTabState((current) => {
      const idx = TAB_ORDER.indexOf(current);
      const prevIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      return TAB_ORDER[prevIdx];
    });
  }, []);

  const openModal = useCallback((type: string, props?: Record<string, unknown>) => {
    setModal({ type, props });
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  const value: NavigationContextValue = {
    activeTab,
    setActiveTab,
    nextTab,
    prevTab,
    modal,
    openModal,
    closeModal,
    isTextInputActive,
    setTextInputActive,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
