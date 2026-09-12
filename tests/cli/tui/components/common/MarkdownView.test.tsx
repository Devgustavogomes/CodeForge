import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { MarkdownView } from '../../../../../src/cli/tui/components/common/MarkdownView.js';

describe('MarkdownView component', () => {
  it('renders markdown headings, lists, inline formatting and code blocks', () => {
    const sampleMd = [
      '# Architecture Overview',
      'This is a **bold text** with `inline code` sample.',
      '',
      '## Key Components',
      '- Engine Service',
      '* CLI Runner',
      '1. First Step',
      '',
      '> Important note for developers',
      '---',
      '```typescript',
      'const value = 42;',
      '```',
    ].join('\n');

    const { lastFrame } = render(<MarkdownView content={sampleMd} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('# Architecture Overview');
    expect(output).toContain('## Key Components');
    expect(output).toContain('bold text');
    expect(output).toContain('inline code');
    expect(output).toContain('• Engine Service');
    expect(output).toContain('• CLI Runner');
    expect(output).toContain('1. First Step');
    expect(output).toContain('Important note for developers');
    expect(output).toContain('const value = 42;');
    expect(output).toContain('──[ code: typescript ]');
    expect(output).toContain('──[ end ]');
  });

  it('handles scroll offset and maxLines correctly', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line item ${i + 1}`).join('\n');

    const { lastFrame } = render(
      <MarkdownView content={lines} scrollOffset={10} maxLines={5} />
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('Line item 11');
    expect(output).toContain('Line item 15');
    expect(output).not.toContain('Line item 10');
    expect(output).not.toContain('Line item 16');
  });

  it('supports truncate mode for single-row rendering', () => {
    const longText = 'A very long line with **bold** and `code` that should be truncated on a single row';
    const { lastFrame } = render(
      <MarkdownView content={longText} truncate={true} />
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('A very long line');
    expect(output).toContain('bold');
    expect(output).toContain('code');
  });
});
