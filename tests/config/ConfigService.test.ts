import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '../../src/config/ConfigService.js';
import { CodeForgeConfig } from '../../src/config/types.js';
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
});
