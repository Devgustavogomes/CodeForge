import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type TabId = 'specs' | 'tasks' | 'run' | 'docs' | 'config';

export interface TabItem {
  id: TabId;
  label: string;
  numberKey: string;
}

export const TABS: readonly TabItem[] = [
  { id: 'specs', label: 'Specs', numberKey: '1' },
  { id: 'tasks', label: 'Tasks', numberKey: '2' },
  { id: 'run', label: 'Run', numberKey: '3' },
  { id: 'docs', label: 'Docs', numberKey: '4' },
  { id: 'config', label: 'Config', numberKey: '5' },
] as const;

export const TAB_ORDER: readonly TabId[] = ['specs', 'tasks', 'run', 'docs', 'config'] as const;

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

  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  isTextInputActive: boolean;
  setTextInputActive: (active: boolean) => void;

  activeSpec: string | null;
  setActiveSpec: (spec: string | null) => void;
}

export interface NavigationProviderProps {
  children: ReactNode;
  initialTab?: TabId;
  initialActiveSpec?: string | null;
}

export const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  initialTab = 'specs',
  initialActiveSpec = null,
}) => {
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTextInputActive, setTextInputActive] = useState(false);
  const [activeSpec, setActiveSpec] = useState<string | null>(initialActiveSpec);

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

  const openCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen((prev) => !prev);
  }, []);

  const value: NavigationContextValue = {
    activeTab,
    setActiveTab,
    nextTab,
    prevTab,
    modal,
    openModal,
    closeModal,
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    isTextInputActive,
    setTextInputActive,
    activeSpec,
    setActiveSpec,
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
