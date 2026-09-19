import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { SupportedLanguage } from '../../../../../src/config/types.js';
import { ConfirmDeleteModal } from '../../../../../src/cli/tui/components/common/ConfirmDeleteModal.js';
import { translate, TranslationKey } from '../../../../../src/cli/ui/i18n.js';
import { flushAsync } from '../../helpers/flushAsync.js';

function renderModal(language: SupportedLanguage = 'en') {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const title = translate('tui_task_delete_title', language);
  const body = translate('tui_task_delete_body', language);
  const detail = translate('tui_task_delete_detail', language, {
    taskId: 'TASK-005',
    title: 'Localized deletion UI',
  });
  const warning = translate('tui_task_delete_warning', language);

  const rendered = render(
    <ConfirmDeleteModal
      title={title}
      body={body}
      detail={detail}
      warning={warning}
      onConfirm={onConfirm}
      onCancel={onCancel}
      language={language}
    />,
  );

  return { ...rendered, onConfirm, onCancel, title, body, detail, warning };
}

const normalizeOutput = (value: string): string =>
  value.replace(/[│╭╮╰╯─┌┐└┘]/g, ' ').replace(/\s+/g, ' ');

describe('ConfirmDeleteModal', () => {
  it.each<SupportedLanguage>(['en', 'pt', 'es'])(
    'includes the delete shortcut in every %s screen hint',
    (language) => {
      const hintKeys: TranslationKey[] = [
        'tui_status_hints_intents',
        'tui_status_hints_tasks',
        'tui_status_hints_docs',
      ];

      for (const key of hintKeys) {
        expect(translate(key, language)).toContain('[d] Delete');
      }
    },
  );

  it('renders localized title, body, entity detail, warning, and controls', () => {
    const { lastFrame, title, body, detail, warning } = renderModal('en');
    const output = normalizeOutput(lastFrame() ?? '');

    expect(output).toContain(title);
    expect(output).toContain(body);
    expect(output).toContain(detail);
    expect(output).toContain(warning);
    expect(output).toContain(translate('tui_delete_confirm', 'en'));
    expect(output).toContain(translate('tui_delete_cancel', 'en'));
  });

  it.each<SupportedLanguage>(['en', 'pt', 'es'])(
    'renders supplied %s content and localized controls',
    (language) => {
      const { lastFrame, title, body, detail, warning } = renderModal(language);
      const output = normalizeOutput(lastFrame() ?? '');

      expect(output).toContain(title);
      expect(output).toContain(body);
      expect(output).toContain(detail);
      expect(output).toContain(warning);
      expect(output).toContain(translate('tui_delete_confirm', language));
      expect(output).toContain(translate('tui_delete_cancel', language));
    },
  );

  it.each([
    ['lowercase y', 'y'],
    ['uppercase Y', 'Y'],
    ['Enter', '\r'],
  ])('confirms with %s', async (_label, input) => {
    const { stdin, onConfirm, onCancel } = renderModal();

    stdin.write(input);
    await flushAsync();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ['lowercase n', 'n'],
    ['uppercase N', 'N'],
    ['Escape', '\u001B'],
  ])('cancels with %s', async (_label, input) => {
    const { stdin, onConfirm, onCancel } = renderModal();

    stdin.write(input);
    await flushAsync(input === '\u001B' ? 100 : 5);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not handle input or render content when closed', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame, stdin } = render(
      <ConfirmDeleteModal
        title="Delete"
        body="Confirm deletion"
        onConfirm={onConfirm}
        onCancel={onCancel}
        isOpen={false}
      />,
    );

    stdin.write('y');
    stdin.write('n');
    stdin.write('\u001B');
    await flushAsync();

    expect(lastFrame()).toBe('');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
