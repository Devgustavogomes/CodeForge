import { TaskScreenItem } from '../components/TaskTree.js';

/**
 * Pure function to format a TaskScreenItem into structured Markdown.
 *
 * Sections:
 * # [ID] Title
 * > Intent: <intentName> (if provided)
 * ## Status ([STATUS])
 * ## Objective
 * ## Dependencies
 * ## Files
 * ## Context
 * ## Acceptance Criteria
 * ## Constraints
 * ## Errors (if present)
 */
export function formatTaskToMarkdown(task: TaskScreenItem, intentName?: string): string {
  const lines: string[] = [];

  // Title: # [ID] Title
  const title = task.title || task.id;
  let headerTitle: string;
  if (title.startsWith('# ')) {
    headerTitle = title;
  } else if (title.startsWith(`[${task.id}]`)) {
    headerTitle = `# ${title}`;
  } else {
    headerTitle = `# [${task.id}] ${title}`;
  }
  lines.push(headerTitle);
  lines.push('');

  if (intentName) {
    lines.push(`> Intent: ${intentName}`);
    lines.push('');
  }

  // Status: ## Status ([STATUS])
  const statusUpper = (task.status || 'pending').toUpperCase();
  lines.push(`## Status ([${statusUpper}])`);
  lines.push('');

  // Objective: ## Objective
  lines.push('## Objective');
  lines.push('');
  lines.push(task.objective?.trim() || 'None');
  lines.push('');

  // Dependencies: ## Dependencies
  lines.push('## Dependencies');
  lines.push('');
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
  if (dependencies.length > 0) {
    for (const dep of dependencies) {
      lines.push(`- ${dep}`);
    }
  } else {
    lines.push('None (Root)');
  }
  lines.push('');

  // Files: ## Files
  lines.push('## Files');
  lines.push('');
  const files = Array.isArray(task.files) ? task.files : [];
  if (files.length > 0) {
    for (const file of files) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push('None');
  }
  lines.push('');

  // Context: ## Context
  lines.push('## Context');
  lines.push('');
  lines.push(task.context?.trim() || 'None');
  lines.push('');

  // Acceptance Criteria: ## Acceptance Criteria
  lines.push('## Acceptance Criteria');
  lines.push('');
  const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
  if (criteria.length > 0) {
    for (const criterion of criteria) {
      lines.push(`- ${criterion}`);
    }
  } else {
    lines.push('None');
  }
  lines.push('');

  // Constraints: ## Constraints
  lines.push('## Constraints');
  lines.push('');
  const constraints = Array.isArray(task.constraints) ? task.constraints : [];
  if (constraints.length > 0) {
    for (const constraint of constraints) {
      lines.push(`- ${constraint}`);
    }
  } else {
    lines.push('None');
  }
  lines.push('');

  // Errors: ## Errors (se houver)
  const errors = Array.isArray(task.errors) ? task.errors : [];
  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
