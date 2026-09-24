import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import yaml from 'yaml';
import { ConfigService } from '../../src/config/ConfigService.js';
import { ConfigureEnvironmentUseCase } from '../../src/application/use-cases/ConfigureEnvironmentUseCase.js';
import { PATHS } from '../../src/infrastructure/paths.js';
import { InMemoryWorkspaceGateway } from '../helpers/in-memory-workspace.js';

describe('ConfigService .env loading, interpolation, and preservation', () => {
  let workspace: InMemoryWorkspaceGateway;
  let configService: ConfigService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TEST_API_KEY;
    delete process.env.SHARED_VAR;
    delete process.env.ROOT_VAR;
    delete process.env.CODEFORGE_VAR;
    delete process.env.CUSTOM_VAR;
    delete process.env.HOST;
    delete process.env.PORT;

    workspace = new InMemoryWorkspaceGateway();
    configService = new ConfigService(workspace);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('PATHS definition', () => {
    it('defines rootEnv and codeforgeEnv', () => {
      expect(PATHS.rootEnv).toBe('.env');
      expect(PATHS.codeforgeEnv).toBe('.codeforge/.env');
    });
  });

  describe('.env loading', () => {
    it('shows the raw API key reference for editing and replaces it when the provider changes', () => {
      process.env.GITHUB_TOKEN = 'github-secret';
      process.env.LINEAR_API_KEY = 'linear-secret';
      workspace.writeFile(PATHS.config, [
        'environment: codex',
        'plannerAgent: planner',
        'executorAgent: executor',
        'language: en',
        'intentSource:',
        '  provider: github',
        '  apiKey: $GITHUB_TOKEN',
      ].join('\n'));

      expect(configService.loadConfig()?.intentSource?.apiKey).toBe('github-secret');
      expect(configService.loadConfig({ interpolate: false })?.intentSource?.apiKey).toBe('$GITHUB_TOKEN');

      const config = configService.loadConfig()!;
      config.intentSource = { provider: 'linear', apiKey: '$LINEAR_API_KEY' };
      configService.saveConfig(config);

      expect(yaml.parse(workspace.readFile(PATHS.config)).intentSource.apiKey).toBe('$LINEAR_API_KEY');
      expect(configService.loadConfig()?.intentSource?.apiKey).toBe('linear-secret');
    });

    it('replaces an existing API key reference with an explicit new key', () => {
      process.env.GITHUB_TOKEN = 'github-secret';
      workspace.writeFile(PATHS.config, 'intentSource:\n  provider: github\n  apiKey: $GITHUB_TOKEN');

      configService.saveConfig({ intentSource: { provider: 'github', apiKey: 'new-literal-key' } });

      expect(yaml.parse(workspace.readFile(PATHS.config)).intentSource.apiKey).toBe('new-literal-key');
    });

    it('loads environment variables from default root .env', () => {
      workspace.writeFile(PATHS.rootEnv, 'ROOT_VAR=root_value\nTEST_API_KEY=key_from_root');
      workspace.writeFile(
        PATHS.config,
        [
          'environment: antigravity',
          'plannerAgent: planner',
          'executorAgent: executor',
          'language: en',
          'intentSource:',
          '  provider: github',
          '  apiKey: $TEST_API_KEY',
        ].join('\n')
      );

      const config = configService.loadConfig();

      expect(process.env.ROOT_VAR).toBe('root_value');
      expect(process.env.TEST_API_KEY).toBe('key_from_root');
      expect(config?.intentSource?.apiKey).toBe('key_from_root');
    });

    it('loads environment variables from default .codeforge/.env with priority over root .env', () => {
      workspace.writeFile(
        PATHS.rootEnv,
        'SHARED_VAR=from_root\nROOT_VAR=only_root'
      );
      workspace.writeFile(
        PATHS.codeforgeEnv,
        'SHARED_VAR=from_codeforge\nCODEFORGE_VAR=only_codeforge'
      );
      workspace.writeFile(
        PATHS.config,
        'environment: antigravity\nplannerAgent: p\nexecutorAgent: e\nlanguage: en\n'
      );

      configService.loadConfig();

      expect(process.env.SHARED_VAR).toBe('from_codeforge');
      expect(process.env.CODEFORGE_VAR).toBe('only_codeforge');
      expect(process.env.ROOT_VAR).toBe('only_root');
    });

    it('loads environment variables from custom envPath configured in config.yaml', () => {
      workspace.writeFile(
        'config/custom.env',
        'CUSTOM_VAR=custom_value\nTEST_API_KEY=custom_key'
      );
      workspace.writeFile(
        PATHS.rootEnv,
        'TEST_API_KEY=root_key'
      );
      workspace.writeFile(
        PATHS.config,
        [
          'environment: antigravity',
          'plannerAgent: p',
          'executorAgent: e',
          'language: en',
          'envPath: config/custom.env',
          'intentSource:',
          '  provider: github',
          '  apiKey: $TEST_API_KEY',
        ].join('\n')
      );

      const config = configService.loadConfig();

      expect(process.env.CUSTOM_VAR).toBe('custom_value');
      expect(process.env.TEST_API_KEY).toBe('custom_key');
      expect(config?.intentSource?.apiKey).toBe('custom_key');
    });

    it('falls back to .codeforge/.env and root .env when custom envPath does not exist', () => {
      workspace.writeFile(
        PATHS.codeforgeEnv,
        'CODEFORGE_VAR=codeforge_fallback'
      );
      workspace.writeFile(
        PATHS.rootEnv,
        'ROOT_VAR=root_fallback'
      );
      workspace.writeFile(
        PATHS.config,
        [
          'environment: antigravity',
          'plannerAgent: p',
          'executorAgent: e',
          'language: en',
          'envPath: non/existent/.env',
        ].join('\n')
      );

      configService.loadConfig();

      expect(process.env.CODEFORGE_VAR).toBe('codeforge_fallback');
      expect(process.env.ROOT_VAR).toBe('root_fallback');
    });

    it('does not throw or break when no .env file or envPath exists', () => {
      workspace.writeFile(
        PATHS.config,
        'environment: antigravity\nplannerAgent: p\nexecutorAgent: e\nlanguage: en\n'
      );

      const config = configService.loadConfig();

      expect(config).toBeTruthy();
      expect(config?.environment).toBe('antigravity');
    });

    it('does not overwrite variables already defined in process.env', () => {
      process.env.SHARED_VAR = 'pre_existing';
      workspace.writeFile(PATHS.rootEnv, 'SHARED_VAR=from_file');
      workspace.writeFile(
        PATHS.config,
        'environment: antigravity\nplannerAgent: p\nexecutorAgent: e\nlanguage: en\n'
      );

      configService.loadConfig();

      expect(process.env.SHARED_VAR).toBe('pre_existing');
    });

    it('safely parses comments, quotes, inline comments, and exports in env files', () => {
      const envContent = [
        '# Header comment',
        'export EXPORTED_VAR=exported',
        'DOUBLE_QUOTES="double quoted value"',
        "SINGLE_QUOTES='single quoted value'",
        'INLINE_COMMENT=value # this is a comment',
        'QUOTED_HASH="value # not a comment"',
        'EMPTY_VAR=',
        '',
      ].join('\r\n');

      const parsed = configService.parseEnv(envContent);

      expect(parsed.EXPORTED_VAR).toBe('exported');
      expect(parsed.DOUBLE_QUOTES).toBe('double quoted value');
      expect(parsed.SINGLE_QUOTES).toBe('single quoted value');
      expect(parsed.INLINE_COMMENT).toBe('value');
      expect(parsed.QUOTED_HASH).toBe('value # not a comment');
      expect(parsed.EMPTY_VAR).toBe('');
      expect(parsed['# Header comment']).toBeUndefined();
    });
  });

  describe('Configuration interpolation ($VAR and ${VAR})', () => {
    it('interpolates $VAR and ${VAR} in config strings', () => {
      process.env.TEST_API_KEY = 'secret_token_123';
      process.env.HOST = 'localhost';
      process.env.PORT = '8080';

      workspace.writeFile(
        PATHS.config,
        [
          'environment: antigravity',
          'plannerAgent: $HOST',
          'executorAgent: ${HOST}:${PORT}',
          'language: en',
          'intentSource:',
          '  provider: github',
          '  apiKey: ${TEST_API_KEY}',
        ].join('\n')
      );

      const config = configService.loadConfig();

      expect(config?.plannerAgent).toBe('localhost');
      expect(config?.executorAgent).toBe('localhost:8080');
      expect(config?.intentSource?.apiKey).toBe('secret_token_123');
    });

    it('resolves unset variables to empty string', () => {
      workspace.writeFile(
        PATHS.config,
        [
          'environment: antigravity',
          'plannerAgent: planner',
          'executorAgent: executor',
          'language: en',
          'intentSource:',
          '  provider: github',
          '  apiKey: $UNSET_VAR',
        ].join('\n')
      );

      const config = configService.loadConfig();

      expect(config?.intentSource?.apiKey).toBe('');
    });

    it('interpolates nested hooks array and strings', () => {
      process.env.CUSTOM_VAR = 'production';
      workspace.writeFile(
        PATHS.config,
        [
          'environment: claude',
          'plannerAgent: p',
          'executorAgent: e',
          'language: en',
          'hooks:',
          '  task.verify:',
          '    - name: test-$CUSTOM_VAR',
          '      run: npm run test:${CUSTOM_VAR}',
        ].join('\n')
      );

      const config = configService.loadConfig();

      expect(config?.hooks?.['task.verify']?.[0].name).toBe('test-production');
      expect(config?.hooks?.['task.verify']?.[0].run).toBe('npm run test:production');
    });
  });

  describe('Non-destructive saveConfig', () => {
    it('preserves existing fields (hooks, intentSource, envPath) when saving new settings in ConfigService', () => {
      workspace.writeFile(
        PATHS.config,
        [
          'environment: claude',
          'plannerAgent: old-planner',
          'executorAgent: old-executor',
          'language: en',
          'envPath: .env.local',
          'hooks:',
          '  task.verify:',
          '    - name: gate-check',
          '      run: npm test',
          'intentSource:',
          '  provider: linear',
          '  team: ENG',
          '  apiKey: $LINEAR_API_KEY',
        ].join('\n')
      );

      // Save updated environment and agents without passing hooks or intentSource
      configService.saveConfig({
        environment: 'antigravity',
        plannerAgent: 'new-planner',
        executorAgent: 'new-executor',
        language: 'pt',
      });

      const savedConfig = yaml.parse(workspace.readFile(PATHS.config));
      expect(savedConfig.intentSource).toEqual({
        provider: 'linear',
        team: 'ENG',
        apiKey: '$LINEAR_API_KEY',
      });
      expect(savedConfig.envPath).toBe('.env.local');
      expect(savedConfig.hooks['task.verify']).toEqual([
        { name: 'gate-check', run: 'npm test' },
      ]);
      expect(savedConfig).toMatchObject({
        environment: 'antigravity',
        plannerAgent: 'new-planner',
        executorAgent: 'new-executor',
        language: 'pt',
      });

      const reloaded = configService.loadConfig();
      expect(reloaded?.environment).toBe('antigravity');
      expect(reloaded?.plannerAgent).toBe('new-planner');
      expect(reloaded?.language).toBe('pt');
      expect(reloaded?.hooks?.['task.verify']).toBeDefined();
      expect(reloaded?.intentSource?.provider).toBe('linear');
      expect(reloaded?.envPath).toBe('.env.local');
    });

    it('preserves existing configuration when saving via ConfigureEnvironmentUseCase', () => {
      workspace.writeFile(
        PATHS.config,
        [
          'environment: claude',
          'plannerAgent: p1',
          'executorAgent: e1',
          'language: en',
          'hooks:',
          '  task.verify:',
          '    - name: check',
          '      run: test',
          'intentSource:',
          '  provider: github',
          '  apiKey: $GITHUB_TOKEN',
        ].join('\n')
      );

      const useCase = new ConfigureEnvironmentUseCase(configService);
      useCase.saveConfig({
        environment: 'antigravity',
        plannerAgent: 'p2',
        executorAgent: 'e2',
        language: 'es',
      });

      const reloaded = useCase.loadConfig();
      expect(reloaded?.environment).toBe('antigravity');
      expect(reloaded?.plannerAgent).toBe('p2');
      expect(reloaded?.executorAgent).toBe('e2');
      expect(reloaded?.language).toBe('es');
      expect(reloaded?.hooks?.['task.verify']).toBeDefined();
      expect(reloaded?.intentSource?.provider).toBe('github');

      const savedConfig = yaml.parse(workspace.readFile(PATHS.config));
      expect(savedConfig.intentSource.apiKey).toBe('$GITHUB_TOKEN');
    });
  });
});
