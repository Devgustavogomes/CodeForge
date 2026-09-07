import React, { createContext, ReactNode, useMemo } from 'react';
import { AppContainer, createAppContainer } from '../../../infrastructure/container.js';

export const ContainerContext = createContext<AppContainer | null>(null);

export interface ContainerProviderProps {
  container?: AppContainer;
  children: ReactNode;
}

export const ContainerProvider: React.FC<ContainerProviderProps> = ({
  container,
  children,
}) => {
  const resolvedContainer = useMemo(
    () => container ?? createAppContainer(),
    [container],
  );

  return (
    <ContainerContext.Provider value={resolvedContainer}>
      {children}
    </ContainerContext.Provider>
  );
};
