import { describe, expect, it } from 'vitest';
import { formatErrorSummary } from '../../../../../src/cli/tui/components/run/TaskDetails.js';

describe('TaskDetails formatErrorSummary', () => {
  it('normalizes blank and heavily spaced diagnostics', () => {
    expect(formatErrorSummary('  failed\r\n\twith   details  ')).toBe(
      'failed with details',
    );
    expect(formatErrorSummary(' \n\t ')).toBe('Unknown error');
  });
});
