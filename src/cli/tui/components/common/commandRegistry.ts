import { TabId } from '../../context/NavigationContext.js';

export type CommandCategory = 'run' | 'spec' | 'plan' | 'task' | 'docs' | 'config' | 'init';

export interface CommandActionContext {
  navigate: (tab: TabId) => void;
  setActiveTab?: (tab: TabId) => void;
  openModal: (type: string, props?: Record<string, unknown>) => void;
  closeModal?: () => void;
  closePalette?: () => void;
  activeSpec?: string | null;
  setActiveSpec?: (spec: string | null) => void;
}

export interface CommandActionItem {
  id: string;
  title: string;
  category: CommandCategory;
  shortcutHint?: string;
  shortcut?: string;
  description: string;
  action: (context: CommandActionContext) => void | Promise<void>;
}

function nav(ctx: CommandActionContext, tab: TabId): void {
  if (typeof ctx.navigate === 'function') {
    ctx.navigate(tab);
  } else if (typeof ctx.setActiveTab === 'function') {
    ctx.setActiveTab(tab);
  }
}

/**
 * Color mapping for category badges in Modern Dark TUI.
 */
export const CATEGORY_COLORS: Record<CommandCategory, string> = {
  run: 'green',
  spec: 'blue',
  plan: 'magenta',
  task: 'yellow',
  docs: 'cyan',
  config: 'white',
  init: 'red',
};

/**
 * Universal CodeForge Command Registry covering all CLI commands and subcommands.
 */
export const COMMAND_REGISTRY: readonly CommandActionItem[] = [
  {
    id: 'run',
    title: 'Run Spec Execution',
    category: 'run',
    shortcutHint: '3',
    shortcut: '3',
    description: 'Execute tasks or monitor execution dashboard',
    action: (ctx) => {
      nav(ctx, 'run');
    },
  },
  {
    id: 'spec:list',
    title: 'Spec List',
    category: 'spec',
    shortcutHint: '1',
    shortcut: '1',
    description: 'List specifications with task status and progress',
    action: (ctx) => {
      nav(ctx, 'specs');
    },
  },
  {
    id: 'spec:create',
    title: 'Spec Create',
    category: 'spec',
    shortcutHint: 'c',
    shortcut: 'c',
    description: 'Create a new specification',
    action: (ctx) => {
      nav(ctx, 'specs');
      ctx.openModal('create_spec');
    },
  },
  {
    id: 'spec:pull',
    title: 'Spec Pull',
    category: 'spec',
    shortcutHint: 'p',
    shortcut: 'p',
    description: 'Pull specification from external source',
    action: (ctx) => {
      nav(ctx, 'specs');
      ctx.openModal('pull_spec');
    },
  },
  {
    id: 'plan:generate',
    title: 'Plan Generate',
    category: 'plan',
    shortcutHint: 'g',
    shortcut: 'g',
    description: 'Generate execution plan and decompose tasks',
    action: (ctx) => {
      nav(ctx, 'specs');
      ctx.openModal('plan_generate', ctx.activeSpec ? { spec: ctx.activeSpec } : undefined);
    },
  },
  {
    id: 'plan:validate',
    title: 'Plan Validate',
    category: 'plan',
    shortcutHint: 'v',
    shortcut: 'v',
    description: 'Validate execution plan and dependency DAG',
    action: (ctx) => {
      nav(ctx, 'specs');
      ctx.openModal('plan_validate', ctx.activeSpec ? { spec: ctx.activeSpec } : undefined);
    },
  },
  {
    id: 'task:info',
    title: 'Task Info',
    category: 'task',
    shortcutHint: 'Enter',
    shortcut: 'Enter',
    description: 'View task details, JSON definition, and execution history',
    action: (ctx) => {
      nav(ctx, 'tasks');
      ctx.openModal('task_info');
    },
  },
  {
    id: 'task:retry',
    title: 'Task Retry',
    category: 'task',
    shortcutHint: 'r',
    shortcut: 'r',
    description: 'Retry the selected or failed task',
    action: (ctx) => {
      nav(ctx, 'tasks');
      ctx.openModal('task_retry');
    },
  },
  {
    id: 'task:complete',
    title: 'Task Complete',
    category: 'task',
    shortcutHint: 'c',
    shortcut: 'c',
    description: 'Manually mark selected task as completed',
    action: (ctx) => {
      nav(ctx, 'tasks');
      ctx.openModal('task_complete');
    },
  },
  {
    id: 'task:reset',
    title: 'Task Reset',
    category: 'task',
    shortcutHint: 'x',
    shortcut: 'x',
    description: 'Reset task status back to pending',
    action: (ctx) => {
      nav(ctx, 'tasks');
      ctx.openModal('task_reset');
    },
  },
  {
    id: 'docs:create',
    title: 'Docs Create',
    category: 'docs',
    shortcutHint: 'c',
    shortcut: 'c',
    description: 'Create architecture or requirements documentation',
    action: (ctx) => {
      nav(ctx, 'docs');
      ctx.openModal('docs_create');
    },
  },
  {
    id: 'docs:update',
    title: 'Docs Update',
    category: 'docs',
    shortcutHint: 'u',
    shortcut: 'u',
    description: 'Update documentation for current codebase or spec',
    action: (ctx) => {
      nav(ctx, 'docs');
      ctx.openModal('docs_update');
    },
  },
  {
    id: 'config',
    title: 'Config',
    category: 'config',
    shortcutHint: '5',
    shortcut: '5',
    description: 'Edit CodeForge configuration, runner models, and language',
    action: (ctx) => {
      nav(ctx, 'config');
    },
  },
  {
    id: 'init',
    title: 'Init Workspace',
    category: 'init',
    shortcutHint: undefined,
    shortcut: undefined,
    description: 'Interactive wizard to initialize CodeForge workspace and configuration',
    action: (ctx) => {
      ctx.openModal('init_wizard');
    },
  },
] as const;

/**
 * Checks whether all characters in pattern appear sequentially in text (subsequence matching).
 */
export function isSubsequence(pattern: string, text: string): boolean {
  let pIdx = 0;
  for (let tIdx = 0; tIdx < text.length && pIdx < pattern.length; tIdx++) {
    if (text[tIdx] === pattern[pIdx]) {
      pIdx++;
    }
  }
  return pIdx === pattern.length;
}

/**
 * Computes a relevance score for matching query against a command item.
 * Higher score indicates stronger relevance. Returns 0 if no match.
 */
export function fuzzyMatchScore(query: string, item: CommandActionItem): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const title = item.title.toLowerCase();
  const category = item.category.toLowerCase();
  const desc = item.description.toLowerCase();
  const id = item.id.toLowerCase();

  // Exact match
  if (title === q) return 1000;
  if (id === q) return 900;
  if (category === q) return 800;

  // Title / ID starts with query
  if (title.startsWith(q)) return 700;
  if (id.startsWith(q)) return 650;

  // Substring in title or id
  if (title.includes(q)) return 500;
  if (id.includes(q)) return 450;

  // Category match
  if (category.startsWith(q)) return 400;
  if (category.includes(q)) return 350;

  // Substring in description
  if (desc.includes(q)) return 300;

  // Subsequence / fuzzy match
  if (isSubsequence(q, title)) return 200;
  if (isSubsequence(q, id)) return 180;
  if (isSubsequence(q, category)) return 150;
  if (isSubsequence(q, desc)) return 100;

  return 0;
}

/**
 * Filters and ranks commands using fuzzy search across title, category, description, and id.
 */
export function filterCommands(
  commands: readonly CommandActionItem[],
  query: string
): CommandActionItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...commands];
  }

  const scored = commands
    .map((item) => ({ item, score: fuzzyMatchScore(trimmed, item) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}
