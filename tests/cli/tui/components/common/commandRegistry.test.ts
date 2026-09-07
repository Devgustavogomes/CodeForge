import { describe, it, expect, vi } from 'vitest';
import {
  COMMAND_REGISTRY,
  filterCommands,
  isSubsequence,
} from '../../../../../src/cli/tui/components/common/commandRegistry.js';

describe('commandRegistry', () => {
  it('defines all required CodeForge CLI actions', () => {
    const ids = COMMAND_REGISTRY.map((c) => c.id);
    expect(ids).toContain('run');
    expect(ids).toContain('spec:list');
    expect(ids).toContain('spec:create');
    expect(ids).toContain('spec:pull');
    expect(ids).toContain('plan:generate');
    expect(ids).toContain('plan:validate');
    expect(ids).toContain('task:info');
    expect(ids).toContain('task:retry');
    expect(ids).toContain('task:complete');
    expect(ids).toContain('task:reset');
    expect(ids).toContain('docs:create');
    expect(ids).toContain('docs:update');
    expect(ids).toContain('config');
    expect(ids).toContain('init');

    expect(COMMAND_REGISTRY.length).toBe(14);
  });

  it('validates that each item contains required fields', () => {
    const validCategories = new Set(['run', 'spec', 'plan', 'task', 'docs', 'config', 'init']);

    for (const item of COMMAND_REGISTRY) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(validCategories.has(item.category)).toBe(true);
      expect(item.description).toBeTruthy();
      expect(typeof item.action).toBe('function');
    }
  });

  describe('action dispatch callbacks', () => {
    it('executes run action', () => {
      const runItem = COMMAND_REGISTRY.find((c) => c.id === 'run')!;
      const navigate = vi.fn();
      const openModal = vi.fn();
      runItem.action({ navigate, openModal });

      expect(navigate).toHaveBeenCalledWith('run');
    });

    it('executes spec:create action opening modal and navigating to specs', () => {
      const specCreate = COMMAND_REGISTRY.find((c) => c.id === 'spec:create')!;
      const navigate = vi.fn();
      const openModal = vi.fn();
      specCreate.action({ navigate, openModal });

      expect(navigate).toHaveBeenCalledWith('specs');
      expect(openModal).toHaveBeenCalledWith('create_spec');
    });

    it('executes spec:pull action opening modal and navigating to specs', () => {
      const specPull = COMMAND_REGISTRY.find((c) => c.id === 'spec:pull')!;
      const navigate = vi.fn();
      const openModal = vi.fn();
      specPull.action({ navigate, openModal });

      expect(navigate).toHaveBeenCalledWith('specs');
      expect(openModal).toHaveBeenCalledWith('pull_spec');
    });

    it('executes plan:generate action with active spec context', () => {
      const planGen = COMMAND_REGISTRY.find((c) => c.id === 'plan:generate')!;
      const navigate = vi.fn();
      const openModal = vi.fn();
      planGen.action({ navigate, openModal, activeSpec: 'auth-spec' });

      expect(navigate).toHaveBeenCalledWith('specs');
      expect(openModal).toHaveBeenCalledWith('plan_generate', { spec: 'auth-spec' });
    });

    it('executes plan:validate action', () => {
      const planVal = COMMAND_REGISTRY.find((c) => c.id === 'plan:validate')!;
      const navigate = vi.fn();
      const openModal = vi.fn();
      planVal.action({ navigate, openModal });

      expect(navigate).toHaveBeenCalledWith('specs');
      expect(openModal).toHaveBeenCalledWith('plan_validate', undefined);
    });

    it('executes task actions (info, retry, complete, reset)', () => {
      const taskActions = ['task:info', 'task:retry', 'task:complete', 'task:reset'];

      for (const id of taskActions) {
        const item = COMMAND_REGISTRY.find((c) => c.id === id)!;
        const navigate = vi.fn();
        const openModal = vi.fn();
        item.action({ navigate, openModal });

        expect(navigate).toHaveBeenCalledWith('tasks');
        expect(openModal).toHaveBeenCalledTimes(1);
      }
    });

    it('executes docs actions (create, update)', () => {
      const docsCreate = COMMAND_REGISTRY.find((c) => c.id === 'docs:create')!;
      const docsUpdate = COMMAND_REGISTRY.find((c) => c.id === 'docs:update')!;

      const nav1 = vi.fn();
      const modal1 = vi.fn();
      docsCreate.action({ navigate: nav1, openModal: modal1 });
      expect(nav1).toHaveBeenCalledWith('docs');
      expect(modal1).toHaveBeenCalledWith('docs_create');

      const nav2 = vi.fn();
      const modal2 = vi.fn();
      docsUpdate.action({ navigate: nav2, openModal: modal2 });
      expect(nav2).toHaveBeenCalledWith('docs');
      expect(modal2).toHaveBeenCalledWith('docs_update');
    });

    it('executes config and init actions', () => {
      const configItem = COMMAND_REGISTRY.find((c) => c.id === 'config')!;
      const initItem = COMMAND_REGISTRY.find((c) => c.id === 'init')!;

      const navConfig = vi.fn();
      const modalConfig = vi.fn();
      configItem.action({ navigate: navConfig, openModal: modalConfig });
      expect(navConfig).toHaveBeenCalledWith('config');

      const navInit = vi.fn();
      const modalInit = vi.fn();
      initItem.action({ navigate: navInit, openModal: modalInit });
      expect(modalInit).toHaveBeenCalledWith('init_wizard');
    });

    it('supports setActiveTab when navigate is not provided in context', () => {
      const runItem = COMMAND_REGISTRY.find((c) => c.id === 'run')!;
      const setActiveTab = vi.fn();
      const openModal = vi.fn();
      runItem.action({ setActiveTab, openModal } as unknown as Parameters<typeof runItem.action>[0]);

      expect(setActiveTab).toHaveBeenCalledWith('run');
    });
  });

  describe('fuzzy filtering', () => {
    it('returns all commands when query is empty or whitespace', () => {
      expect(filterCommands(COMMAND_REGISTRY, '').length).toBe(COMMAND_REGISTRY.length);
      expect(filterCommands(COMMAND_REGISTRY, '   ').length).toBe(COMMAND_REGISTRY.length);
    });

    it('filters commands case-insensitively', () => {
      const resultsLower = filterCommands(COMMAND_REGISTRY, 'spec');
      const resultsUpper = filterCommands(COMMAND_REGISTRY, 'SPEC');
      const resultsMixed = filterCommands(COMMAND_REGISTRY, 'SpEc');

      expect(resultsLower.length).toBeGreaterThan(0);
      expect(resultsLower.map((r) => r.id)).toEqual(resultsUpper.map((r) => r.id));
      expect(resultsLower.map((r) => r.id)).toEqual(resultsMixed.map((r) => r.id));
    });

    it('matches partial substrings in title and description', () => {
      const retryResults = filterCommands(COMMAND_REGISTRY, 'retry');
      expect(retryResults.some((c) => c.id === 'task:retry')).toBe(true);

      const wizardResults = filterCommands(COMMAND_REGISTRY, 'wizard');
      expect(wizardResults.some((c) => c.id === 'init')).toBe(true);
    });

    it('matches subsequence fuzzy patterns', () => {
      expect(isSubsequence('plval', 'plan validate')).toBe(true);
      expect(isSubsequence('plval', 'random text')).toBe(false);

      const results = filterCommands(COMMAND_REGISTRY, 'plval');
      expect(results.some((c) => c.id === 'plan:validate')).toBe(true);
    });

    it('returns empty array when query does not match any command', () => {
      const results = filterCommands(COMMAND_REGISTRY, 'xyznonexistent123');
      expect(results).toEqual([]);
    });

    it('ranks exact and prefix matches higher than subsequence matches', () => {
      const results = filterCommands(COMMAND_REGISTRY, 'task');
      // All top results should have 'task' in category or title prefix
      expect(results[0].category).toBe('task');
    });
  });
});
