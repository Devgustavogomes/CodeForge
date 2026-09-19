import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '../../src/config/ConfigService.js';
import { CodeForgeConfig } from '../../src/config/types.js';
import { PATHS } from '../../src/infrastructure/paths.js';
import { InMemoryWorkspaceGateway } from '../helpers/in-memory-workspace.js';

describe('ConfigService', () => {
  let workspace: InMemoryWorkspaceGateway;
  let configService: ConfigService;

  beforeEach(() => {
    workspace = new InMemoryWorkspaceGateway();
    configService = new ConfigService(workspace);
  });

  it('should return null if file does not exist', () => {
    const config = configService.loadConfig();
    expect(config).toBeNull();
  });

  it('should save and load config correctly', () => {
    const testConfig: CodeForgeConfig = {
      environment: 'antigravity',
      plannerAgent: 'planner-1',
      executorAgent: 'executor-1',
      language: 'en',
    };

    configService.saveConfig(testConfig);
    const loadedConfig = configService.loadConfig();

    expect(loadedConfig).toEqual(testConfig);
  });

  it('should save and load externalTerminal option correctly', () => {
    const testConfig: CodeForgeConfig = {
      environment: 'antigravity',
      plannerAgent: 'planner-1',
      executorAgent: 'executor-1',
      language: 'en',
      externalTerminal: true,
    };

    configService.saveConfig(testConfig);
    const loadedConfig = configService.loadConfig();

    expect(loadedConfig?.externalTerminal).toBe(true);
  });

  it('should save and load intentSource option correctly and preserve $VAR', () => {
    process.env.GITHUB_TOKEN = 'token-123';
    try {
      const testConfig: CodeForgeConfig = {
        environment: 'antigravity',
        plannerAgent: 'planner-1',
        executorAgent: 'executor-1',
        language: 'en',
        intentSource: {
          provider: 'github',
          project: 'org/repo',
          apiKey: '$GITHUB_TOKEN',
        },
      };

      configService.saveConfig(testConfig);
      const loadedConfig = configService.loadConfig();

      expect(loadedConfig?.intentSource?.provider).toBe('github');
      expect(loadedConfig?.intentSource?.project).toBe('org/repo');
      expect(loadedConfig?.intentSource?.apiKey).toBe('token-123');

      const rawSavedContent = workspace.readFile(PATHS.config);
      expect(rawSavedContent).toContain('apiKey: $GITHUB_TOKEN');
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
  });
});

