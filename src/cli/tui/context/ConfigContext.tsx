import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import { CodeForgeConfig, resolveAiReviewConfig } from '../../../config/types.js';
import { useContainer } from '../hooks/useContainer.js';

export interface ConfigContextValue {
  config: CodeForgeConfig;
  updateConfig: (newConfig: CodeForgeConfig) => void;
  reloadConfig: () => void;
}

export const DEFAULT_TUI_CONFIG: CodeForgeConfig = {
  language: 'en',
  environment: 'local',
  plannerAgent: 'default',
  executorAgent: 'default',
  hooks: {},
  intentSource: { provider: 'filesystem' },
  aiReview: resolveAiReviewConfig(),
};

export const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export interface ConfigProviderProps {
  children: ReactNode;
}

function resolveConfig(config: CodeForgeConfig | null): CodeForgeConfig {
  if (!config) return DEFAULT_TUI_CONFIG;
  return { ...config, aiReview: resolveAiReviewConfig(config.aiReview) };
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const { configService } = useContainer();
  const [config, setConfig] = useState<CodeForgeConfig>(() =>
    resolveConfig(configService.loadConfig()),
  );

  const updateConfig = useCallback((newConfig: CodeForgeConfig) => {
    setConfig(resolveConfig(newConfig));
  }, []);

  const reloadConfig = useCallback(() => {
    setConfig(resolveConfig(configService.loadConfig()));
  }, [configService]);

  return (
    <ConfigContext.Provider value={{ config, updateConfig, reloadConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
