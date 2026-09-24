import { describe, it, expect, beforeEach } from 'vitest';
import yaml from 'yaml';
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

    expect(loadedConfig).toMatchObject(testConfig);
    expect(loadedConfig?.aiReview).toEqual({
      enabled: false,
      agent: 'default',
      maxRounds: 3,
    });
  });

  it('applies AI review defaults and persists an explicit review configuration', () => {
    workspace.writeFile(PATHS.config, [
      'environment: antigravity',
      'plannerAgent: planner-1',
      'executorAgent: executor-1',
      'aiReview:',
      '  enabled: true',
      '  agent: $REVIEW_AGENT',
    ].join('\n'));
    process.env.REVIEW_AGENT = 'reviewer-1';

    try {
      expect(configService.loadConfig()?.aiReview).toEqual({
        enabled: true,
        agent: 'reviewer-1',
        maxRounds: 3,
      });

      configService.saveConfig({
        aiReview: { enabled: true, agent: 'reviewer-1', maxRounds: 5 },
      });

      expect(configService.loadConfig()?.aiReview).toEqual({
        enabled: true,
        agent: 'reviewer-1',
        maxRounds: 5,
      });
    } finally {
      delete process.env.REVIEW_AGENT;
    }
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

      const savedConfig = yaml.parse(workspace.readFile(PATHS.config));
      expect(savedConfig.intentSource).toEqual({
        provider: 'github',
        project: 'org/repo',
        apiKey: '$GITHUB_TOKEN',
      });
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
  });
});
