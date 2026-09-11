import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateDocModal } from '../../../../../src/cli/tui/components/docs/UpdateDocModal.js';
import { renderWithProviders } from '../../helpers/renderWithProviders.js';
import { AppContainer } from '../../../../../src/infrastructure/container.js';
import { AffectedDoc } from '../../../../../src/domain/doc.js';

const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

describe('UpdateDocModal - Componente Orquestrador da Modal de Atualização (BDD)', () => {
  const sampleAffectedDocs: AffectedDoc[] = [
    {
      docName: 'architecture',
      docPath: '.codeforge/docs/architecture.md',
      specPaths: ['.codeforge/specs/tui.md'],
      matchedFiles: ['src/cli/tui/App.tsx', 'src/cli/tui/Docs.tsx'],
    },
    {
      docName: 'security',
      docPath: '.codeforge/docs/security.md',
      specPaths: ['.codeforge/specs/tui.md'],
      matchedFiles: ['src/security/auth.ts'],
    },
  ];

  let mockListNames: ReturnType<typeof vi.fn>;
  let mockGetAffectedDocs: ReturnType<typeof vi.fn>;
  let mockContainer: AppContainer;

  beforeEach(() => {
    mockListNames = vi.fn().mockReturnValue(['tui', 'decouple', 'auth']);
    mockGetAffectedDocs = vi.fn().mockReturnValue({
      kind: 'affected-docs',
      affectedDocs: sampleAffectedDocs,
    });

    mockContainer = {
      listSpecsUseCase: { listNames: mockListNames },
      updateDocUseCase: { getAffectedDocs: mockGetAffectedDocs },
    } as unknown as AppContainer;
  });

  describe('1. Renderização Inicial e Visibilidade', () => {
    it('não renderiza nada quando isOpen for false', () => {
      const onClose = vi.fn();
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal isOpen={false} onClose={onClose} container={mockContainer} />
      );

      expect(lastFrame()).toBe('');
    });

    it('renderiza a Etapa 1 (Seleção de Modo) por padrão ao ser aberto', () => {
      const onClose = vi.fn();
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={onClose}
          container={mockContainer}
          selectedDoc="architecture"
        />
      );
      const output = lastFrame() ?? '';

      // Título contextualizado
      expect(output).toContain('Atualizar Documentação');
      // Opções da Etapa 1
      expect(output).toContain('1. Atualizar documento selecionado diretamente');
      expect(output).toContain('2. Detectar automaticamente via Git e Escopo do Manifest');
      // Documento alvo formatado
      expect(output).toContain('Documento alvo:');
      expect(output).toContain('architecture.md');
      // Opção 1 inicialmente selecionada
      expect(output).toContain('(•)');
      expect(output).toMatch(/\(•\)\s+1\. Atualizar documento selecionado diretamente/);
      // Barra de atalhos
      expect(output).toContain('[↑/↓ ou j/k] Navegar · [Enter] Avançar · [Esc] Cancelar');
    });

    it('aceita selectedDoc como objeto DocItemInfo ou string simples', () => {
      const { lastFrame: frameString } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          selectedDoc="api-reference"
        />
      );
      expect(frameString() ?? '').toContain('api-reference.md');

      const { lastFrame: frameObj } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          selectedDoc={{ name: 'database-design.md', specs: ['db'] }}
        />
      );
      expect(frameObj() ?? '').toContain('database-design.md');
    });

    it('permite passar título customizado via prop title', () => {
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          title="Meu Título Personalizado"
        />
      );

      expect(lastFrame() ?? '').toContain('Meu Título Personalizado');
    });
  });

  describe('2. Navegação de Modo na Etapa 1', () => {
    it('alterna para o Modo Automático ao pressionar seta para baixo (ou j)', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal isOpen={true} onClose={vi.fn()} container={mockContainer} />
      );

      // Inicia com Modo Direto (opção 1)
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+1\. Atualizar documento selecionado diretamente/);

      // Pressiona j para descer
      stdin.write('j');
      await tick();

      expect(lastFrame() ?? '').toMatch(/\(•\)\s+2\. Detectar automaticamente via Git e Escopo do Manifest/);
      expect(lastFrame() ?? '').toMatch(/\(\s\)\s+1\. Atualizar documento selecionado diretamente/);
    });

    it('alterna de volta para o Modo Direto ao pressionar seta para cima (ou k)', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal isOpen={true} onClose={vi.fn()} container={mockContainer} />
      );

      // Desce para Automático
      stdin.write('j');
      await tick();
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+2\. Detectar automaticamente/);

      // Sobe com k de volta para Direto
      stdin.write('k');
      await tick();
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+1\. Atualizar documento selecionado diretamente/);
    });

    it('alterna de modo utilizando a tecla Tab', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal isOpen={true} onClose={vi.fn()} container={mockContainer} />
      );

      stdin.write('\t');
      await tick();
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+2\. Detectar automaticamente/);

      stdin.write('\t');
      await tick();
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+1\. Atualizar documento selecionado diretamente/);
    });

    it('permite seleção direta do modo usando teclas numéricas 1 e 2', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal isOpen={true} onClose={vi.fn()} container={mockContainer} />
      );

      stdin.write('2');
      await tick();
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+2\. Detectar automaticamente/);

      stdin.write('1');
      await tick();
      expect(lastFrame() ?? '').toMatch(/\(•\)\s+1\. Atualizar documento selecionado diretamente/);
    });
  });

  describe('3. Transição de Etapas com Enter (Etapa 1 -> Etapa 2)', () => {
    it('com Modo Direto selecionado, pressionar Enter avança para a Etapa 2A (DirectUpdateStep)', async () => {
      const onConfirmDirect = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          selectedDoc="architecture"
          availableSpecs={['tui', 'auth']}
          initialSpec="tui"
          onConfirmDirect={onConfirmDirect}
        />
      );

      // Pressiona Enter na Etapa 1
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      // Deve exibir cabeçalho contextualizado de Modo Direto
      expect(output).toContain('Atualizar Documentação — Modo Direto');
      // Subcomponente DirectUpdateStep ativo
      expect(output).toContain('Documento Alvo:');
      expect(output).toContain('architecture.md');
      expect(output).toContain('Spec de Referência:');
      expect(output).toContain('● tui');
      expect(output).toContain('[Space/←/→] Selecionar Spec · [Enter] Atualizar · [Esc] Voltar');

      // Nenhuma confirmação ou operação assíncrona deve ter sido disparada ainda
      expect(onConfirmDirect).not.toHaveBeenCalled();
    });

    it('com Modo Automático selecionado, pressionar Enter avança para a Etapa 2B (AutoUpdateStep) e resolve docs afetados', async () => {
      const onConfirmAuto = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          availableSpecs={['tui']}
          initialSpec="tui"
          onConfirmAuto={onConfirmAuto}
        />
      );

      // Seleciona Modo Automático
      stdin.write('j');
      await tick();

      // Pressiona Enter
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      // Deve exibir cabeçalho contextualizado de Modo Automático
      expect(output).toContain('Atualizar Documentação — Modo Automático');
      // Subcomponente AutoUpdateStep ativo
      expect(output).toContain('Spec de Referência:');
      expect(output).toContain('tui');
      // Invocou getAffectedDocs
      expect(mockGetAffectedDocs).toHaveBeenCalledWith('tui');
      // Lista documentos afetados
      expect(output).toContain('[ Atualizar todos os 2 afetados ]');
      expect(output).toContain('architecture');
      expect(output).toContain('(2 arquivos alterados)');
      expect(output).toContain('security');
      expect(output).toContain('(1 arquivo alterado)');

      // Nenhuma confirmação de atualização assíncrona disparada ainda
      expect(onConfirmAuto).not.toHaveBeenCalled();
    });
  });

  describe('4. Navegação com Esc (Etapa 2 -> Etapa 1 -> onClose)', () => {
    it('ao pressionar Esc na Etapa 2A, retrocede para a Etapa 1 e não chama onClose', async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={onClose}
          container={mockContainer}
          selectedDoc="architecture"
        />
      );

      // Avança para Etapa 2A
      stdin.write('\r');
      await tick();
      expect(lastFrame() ?? '').toContain('Atualizar Documentação — Modo Direto');

      // Pressiona Esc
      stdin.write('\u001B');
      await tick();

      const output = lastFrame() ?? '';
      // Voltou para a Etapa 1
      expect(output).toContain('Atualizar Documentação');
      expect(output).toContain('1. Atualizar documento selecionado diretamente');
      expect(output).not.toContain('Atualizar Documentação — Modo Direto');
      // onClose NÃO foi chamado
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ao pressionar Esc na Etapa 2B, retrocede para a Etapa 1 e não chama onClose', async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={onClose}
          container={mockContainer}
        />
      );

      // Seleciona Modo Automático e avança
      stdin.write('j');
      await tick();
      stdin.write('\r');
      await tick();
      expect(lastFrame() ?? '').toContain('Atualizar Documentação — Modo Automático');

      // Pressiona Esc
      stdin.write('\u001B');
      await tick();

      const output = lastFrame() ?? '';
      // Voltou para a Etapa 1
      expect(output).toContain('Atualizar Documentação');
      expect(output).toContain('1. Atualizar documento selecionado diretamente');
      expect(output).not.toContain('Atualizar Documentação — Modo Automático');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ao pressionar Esc na Etapa 1, aciona a propriedade onClose', async () => {
      const onClose = vi.fn();
      const { stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={onClose}
          container={mockContainer}
        />
      );

      // Pressiona Esc na Etapa 1
      stdin.write('\u001B');
      await tick();

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Interação e Confirmação na Etapa 2A (Modo Direto)', () => {
    it('permite ciclar a especificação de referência com setas horizontais ou espaço', async () => {
      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          selectedDoc="architecture"
          availableSpecs={['tui', 'decouple', 'auth']}
          initialSpec="tui"
        />
      );

      // Avança para Etapa 2A
      stdin.write('\r');
      await tick();
      expect(lastFrame() ?? '').toContain('● tui');

      // Seta para a direita: avança para decouple
      stdin.write('\u001B[C'); // right arrow
      await tick();
      expect(lastFrame() ?? '').toContain('● decouple');

      // Barra de espaço: avança para auth
      stdin.write(' ');
      await tick();
      expect(lastFrame() ?? '').toContain('● auth');

      // Seta para a esquerda: volta para decouple
      stdin.write('\u001B[D'); // left arrow
      await tick();
      expect(lastFrame() ?? '').toContain('● decouple');
    });

    it('ao pressionar Enter na Etapa 2A, invoca onConfirmDirect com o documento e a especificação escolhidos', async () => {
      const onConfirmDirect = vi.fn();
      const onConfirm = vi.fn();

      const { stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          selectedDoc="architecture.md"
          availableSpecs={['tui', 'decouple']}
          initialSpec="tui"
          onConfirmDirect={onConfirmDirect}
          onConfirm={onConfirm}
        />
      );

      // Avança para Etapa 2A
      stdin.write('\r');
      await tick();

      // Muda para a segunda spec (decouple)
      stdin.write(' ');
      await tick();

      // Confirma na Etapa 2A com Enter
      stdin.write('\r');
      await tick();

      expect(onConfirmDirect).toHaveBeenCalledWith('architecture', 'decouple');
      expect(onConfirm).toHaveBeenCalledWith({
        mode: 'direct',
        docName: 'architecture',
        specName: 'decouple',
      });
    });
  });

  describe('6. Interação e Confirmação na Etapa 2B (Modo Automático)', () => {
    it('ao pressionar Enter na opção em lote, invoca onConfirmAuto com "all" e os documentos afetados', async () => {
      const onConfirmAuto = vi.fn();
      const onConfirm = vi.fn();

      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          availableSpecs={['tui']}
          initialSpec="tui"
          onConfirmAuto={onConfirmAuto}
          onConfirm={onConfirm}
        />
      );

      // Avança para Automático
      stdin.write('2');
      await tick();
      stdin.write('\r');
      await tick();

      expect(lastFrame() ?? '').toContain('● [ Atualizar todos os 2 afetados ]');

      // Confirma opção em lote com Enter
      stdin.write('\r');
      await tick();

      expect(onConfirmAuto).toHaveBeenCalledWith('tui', 'all', sampleAffectedDocs);
      expect(onConfirm).toHaveBeenCalledWith({
        mode: 'auto',
        specName: 'tui',
        target: 'all',
        affectedDocs: sampleAffectedDocs,
      });
    });

    it('permite navegar entre documentos afetados com setas verticais ou j/k e confirmar documento individual', async () => {
      const onConfirmAuto = vi.fn();

      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          availableSpecs={['tui']}
          initialSpec="tui"
          onConfirmAuto={onConfirmAuto}
        />
      );

      // Modo Automático
      stdin.write('2');
      await tick();
      stdin.write('\r');
      await tick();

      // Desce para o primeiro documento afetado (architecture)
      stdin.write('j');
      await tick();
      expect(lastFrame() ?? '').toContain('● architecture');
      expect(lastFrame() ?? '').toContain('○ [ Atualizar todos os 2 afetados ]');

      // Desce para o segundo documento afetado (security)
      stdin.write('j');
      await tick();
      expect(lastFrame() ?? '').toContain('● security');
      expect(lastFrame() ?? '').toContain('○ architecture');

      // Confirma seleção individual de security
      stdin.write('\r');
      await tick();

      expect(onConfirmAuto).toHaveBeenCalledWith('tui', 'security', sampleAffectedDocs);
    });

    it('re-executa getAffectedDocs ao ciclar a especificação na Etapa 2B com espaço', async () => {
      mockGetAffectedDocs.mockImplementation((spec: string) => {
        if (spec === 'tui') {
          return { kind: 'affected-docs', affectedDocs: sampleAffectedDocs };
        }
        return { kind: 'no-affected-docs' };
      });

      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          availableSpecs={['tui', 'other-spec']}
          initialSpec="tui"
        />
      );

      // Entra na Etapa 2B
      stdin.write('2');
      await tick();
      stdin.write('\r');
      await tick();

      expect(lastFrame() ?? '').toContain('Spec de Referência:');
      expect(lastFrame() ?? '').toContain('tui');
      expect(lastFrame() ?? '').toContain('[ Atualizar todos os 2 afetados ]');

      // Cicla spec com espaço para 'other-spec'
      stdin.write(' ');
      await tick();

      expect(mockGetAffectedDocs).toHaveBeenCalledWith('other-spec');
      const output = lastFrame() ?? '';
      expect(output).toContain('other-spec');
      expect(output).toContain('Ausência de documentos impactados (no-affected-docs)');
    });
  });

  describe('7. Tratamento de Casos de Borda do Git e Manifest', () => {
    it('quando getAffectedDocs retorna "no-git", exibe alerta explicativo e Enter não dispara onConfirmAuto', async () => {
      mockGetAffectedDocs.mockReturnValue({ kind: 'no-git' });
      const onConfirmAuto = vi.fn();

      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          initialSpec="tui"
          onConfirmAuto={onConfirmAuto}
        />
      );

      // Avança para Automático
      stdin.write('2');
      await tick();
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Repositório Git não encontrado (no-git)');
      expect(output).toContain('[Esc] Voltar');
      expect(output).not.toContain('[Enter] Atualizar');

      // Tenta submeter com Enter
      stdin.write('\r');
      await tick();

      expect(onConfirmAuto).not.toHaveBeenCalled();
    });

    it('quando getAffectedDocs retorna "no-changed-files", exibe alerta correspondente', async () => {
      mockGetAffectedDocs.mockReturnValue({ kind: 'no-changed-files' });

      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          initialSpec="tui"
        />
      );

      stdin.write('2');
      await tick();
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Ausência de modificações no Git (no-changed-files)');
    });

    it('quando getAffectedDocs retorna "no-affected-docs", exibe alerta de ausência de documentos no escopo', async () => {
      mockGetAffectedDocs.mockReturnValue({ kind: 'no-affected-docs' });

      const { lastFrame, stdin } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          initialSpec="tui"
        />
      );

      stdin.write('2');
      await tick();
      stdin.write('\r');
      await tick();

      const output = lastFrame() ?? '';
      expect(output).toContain('Ausência de documentos impactados (no-affected-docs)');
    });
  });

  describe('8. Customizações de Props (initialStep, initialMode, width, isLoading, error)', () => {
    it('respeita initialStep="direct" iniciando diretamente na Etapa 2A', () => {
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          selectedDoc="architecture"
          initialStep="direct"
          initialSpec="tui"
        />
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('Atualizar Documentação — Modo Direto');
      expect(output).toContain('Documento Alvo:');
      expect(output).toContain('architecture.md');
    });

    it('respeita initialStep="auto" iniciando diretamente na Etapa 2B', () => {
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          initialStep="auto"
          initialSpec="tui"
        />
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('Atualizar Documentação — Modo Automático');
      expect(output).toContain('[ Atualizar todos os 2 afetados ]');
    });

    it('exibe feedback de carregamento quando isLoading for true na Etapa 2A', () => {
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          initialStep="direct"
          isLoading={true}
        />
      );

      expect(lastFrame() ?? '').toContain('Preparando atualização manual');
    });

    it('exibe feedback de erro externo fornecido via prop error', () => {
      const { lastFrame } = renderWithProviders(
        <UpdateDocModal
          isOpen={true}
          onClose={vi.fn()}
          container={mockContainer}
          initialStep="direct"
          error="Falha na leitura do manifest"
        />
      );

      expect(lastFrame() ?? '').toContain('Falha na leitura do manifest');
    });
  });
});
