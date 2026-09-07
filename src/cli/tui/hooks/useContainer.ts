import { useContext } from 'react';
import { ContainerContext } from '../context/ContainerContext.js';
import { AppContainer } from '../../../infrastructure/container.js';

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext);
  if (!container) {
    throw new Error('useContainer must be used within a ContainerProvider');
  }
  return container;
}

export default useContainer;
