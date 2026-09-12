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
    expect(translate('tui_badge_tracked', 'en')).toBe('Tracked');
    expect(translate('tui_badge_tracked', 'pt')).toBe('Rastreado');
    expect(translate('tui_badge_untracked', 'en')).toBe('Untracked');
    expect(translate('tui_badge_untracked', 'pt')).toBe('Não Rastreado');
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

  it('translates TUI docs keys in en, pt, and es', () => {
    // List & Viewer
    expect(translate('tui_docs_list_title', 'en', { count: 3 })).toBe('Docs (3)');
    expect(translate('tui_docs_list_title', 'pt', { count: 3 })).toBe('Docs (3)');
    expect(translate('tui_docs_list_shortcuts', 'en')).toBe('[c] Create · [u] Update');
    expect(translate('tui_docs_list_shortcuts', 'pt')).toBe('[c] Criar · [u] Atualizar');
    expect(translate('tui_docs_details_title', 'en', { name: 'arch.md' })).toBe('Document Details: arch.md');
    expect(translate('tui_docs_details_title', 'pt', { name: 'arch.md' })).toBe('Detalhes do Documento: arch.md');

    // Progress Banner
    expect(translate('tui_docs_progress_action_create', 'en')).toBe('Creating');
    expect(translate('tui_docs_progress_action_create', 'pt')).toBe('Criando');
    expect(translate('tui_docs_progress_action_update', 'en')).toBe('Updating');
    expect(translate('tui_docs_progress_action_update', 'pt')).toBe('Atualizando');
    expect(translate('tui_docs_progress_title', 'pt', { action: 'Criando', doc: '[arch]' })).toBe('Criando Documentação: [arch]');
    expect(translate('tui_docs_progress_elapsed', 'en')).toBe('Elapsed: ');
    expect(translate('tui_docs_progress_elapsed', 'pt')).toBe('Decorrido: ');
    expect(translate('tui_docs_create_success', 'pt', { name: 'arch', elapsed: '5s' })).toBe('✓ Documentação "arch" criada com sucesso em 5s!');
    expect(translate('tui_docs_update_single_success', 'pt', { name: 'arch.md', elapsed: '3s' })).toBe('✓ Documentação "arch.md" atualizada com sucesso em 3s!');
    expect(translate('tui_docs_update_batch_success', 'pt', { count: 2, elapsed: '8s' })).toBe('✓ 2 documentações atualizadas com sucesso em 8s!');

    // Update Doc Modal & Steps
    expect(translate('tui_modal_update_doc', 'en')).toBe('Update Documentation');
    expect(translate('tui_modal_update_doc', 'pt')).toBe('Atualizar Documentação');
    expect(translate('tui_modal_update_doc_direct', 'en')).toBe('Update Documentation — Direct Mode');
    expect(translate('tui_modal_update_doc_direct', 'pt')).toBe('Atualizar Documentação — Modo Direto');
    expect(translate('tui_modal_update_doc_auto', 'en')).toBe('Update Documentation — Automatic Mode');
    expect(translate('tui_modal_update_doc_auto', 'pt')).toBe('Atualizar Documentação — Modo Automático');

    expect(translate('tui_docs_mode_direct_title', 'en')).toBe('1. Update selected document directly');
    expect(translate('tui_docs_mode_direct_title', 'pt')).toBe('1. Atualizar documento selecionado diretamente');
    expect(translate('tui_docs_mode_auto_title', 'en')).toBe('2. Detect automatically via Git and Manifest Scope');
    expect(translate('tui_docs_mode_auto_title', 'pt')).toBe('2. Detectar automaticamente via Git e Escopo do Manifest');

    expect(translate('tui_docs_auto_no_git_title', 'pt')).toBe('⚠ Repositório Git não encontrado (no-git)');
    expect(translate('tui_docs_auto_no_changes_title', 'pt')).toBe('⚠ Ausência de modificações no Git (no-changed-files)');
    expect(translate('tui_docs_auto_no_affected_title', 'pt')).toBe('⚠ Ausência de documentos impactados (no-affected-docs)');
    expect(translate('tui_docs_edge_no_git', 'pt')).toBe('Repositório Git não encontrado.');

    // View Doc Modal
    expect(translate('tui_docs_view_title', 'en', { name: 'arch.md' })).toBe('View Documentation: arch.md');
    expect(translate('tui_docs_view_title', 'pt', { name: 'arch.md' })).toBe('Visualizar Documentação: arch.md');
    expect(translate('tui_docs_view_shortcuts', 'pt')).toBe('[↑/↓ ou j/k] Rolar · [g/G] Início/Fim · [Esc/q] Voltar');
    expect(translate('tui_docs_view_empty', 'pt')).toBe('Documentação vazia ou não encontrada no disco.');
  });
});
