import { describe, it, expect } from 'vitest';
import { translate } from '../../../src/cli/ui/i18n.js';

describe('i18n TUI translations', () => {
  it('translates tab labels in en and pt', () => {
    expect(translate('tui_tab_run', 'en')).toBe('Run');
    expect(translate('tui_tab_run', 'pt')).toBe('Executar');
    expect(translate('tui_tab_specs', 'en')).toBe('Specs');
    expect(translate('tui_tab_specs', 'pt')).toBe('Specs');
    expect(translate('tui_tab_tasks', 'en')).toBe('Tasks');
    expect(translate('tui_tab_tasks', 'pt')).toBe('Tarefas');
    expect(translate('tui_tab_docs', 'en')).toBe('Docs');
    expect(translate('tui_tab_docs', 'pt')).toBe('Documentação');
    expect(translate('tui_tab_config', 'en')).toBe('Config');
    expect(translate('tui_tab_config', 'pt')).toBe('Configuração');
  });

  it('translates status badges in en and pt', () => {
    expect(translate('tui_badge_not_started', 'en')).toBe('Not Started');
    expect(translate('tui_badge_not_started', 'pt')).toBe('Não Iniciado');
    expect(translate('tui_badge_completed', 'en')).toBe('Completed');
    expect(translate('tui_badge_completed', 'pt')).toBe('Concluído');
    expect(translate('tui_badge_running', 'en')).toBe('Running');
    expect(translate('tui_badge_running', 'pt')).toBe('Executando');
    expect(translate('tui_badge_failed', 'en')).toBe('Failed');
    expect(translate('tui_badge_failed', 'pt')).toBe('Falhou');
  });

  it('interpolates params properly in both en and pt', () => {
    const enText = translate('tui_minimal_window_too_small', 'en', {
      columns: 50,
      rows: 10,
    });
    expect(enText).toBe('⚠️ Window too small (50x10)');

    const ptText = translate('tui_minimal_window_too_small', 'pt', {
      columns: 50,
      rows: 10,
    });
    expect(ptText).toBe('⚠️ Janela muito pequena (50x10)');

    const enSpec = translate('tui_header_active_spec', 'en', { spec: 'auth' });
    expect(enSpec).toBe('Spec: auth');

    const ptSpec = translate('tui_header_active_spec', 'pt', { spec: 'auth' });
    expect(ptSpec).toBe('Spec: auth');
  });

  it('translates modal titles and confirmation prompts', () => {
    expect(translate('tui_modal_command_palette', 'en')).toBe('Command Palette');
    expect(translate('tui_modal_command_palette', 'pt')).toBe('Paleta de Comandos');

    expect(translate('tui_quit_confirm_message', 'en')).toBe('Are you sure you want to quit CodeForge?');
    expect(translate('tui_quit_confirm_message', 'pt')).toBe('Tem certeza de que deseja sair do CodeForge?');
    expect(translate('tui_quit_confirm_yes', 'en')).toBe('[y / Enter] Quit');
    expect(translate('tui_quit_confirm_yes', 'pt')).toBe('[y / Enter] Sair');
    expect(translate('tui_quit_confirm_no', 'en')).toBe('[n / Esc] Cancel');
    expect(translate('tui_quit_confirm_no', 'pt')).toBe('[n / Esc] Cancelar');
  });
});
