import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { SpecDetails } from '../../../../../src/cli/tui/components/specs/components/SpecDetails.js';

describe('SpecDetails component', () => {
  it('exibe as legendas de atalho corretas no painel de detalhes', () => {
    const mockSpec = {
      name: 'auth',
      title: 'Authentication Module',
      status: 'pending' as const,
      taskCount: 3,
    };

    const { lastFrame } = render(<SpecDetails spec={mockSpec} isSideBySide={false} />);
    const output = lastFrame() ?? '';

    expect(output).toContain('[Enter] Open in Run  │  [t] Open in Tasks  │  [g] Generate Plan');
    expect(output).toContain('[v] Validate Plan    │  [c] Create         │  [p] Pull');
  });
});
