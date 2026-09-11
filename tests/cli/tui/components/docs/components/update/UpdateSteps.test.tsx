import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import {
  UpdateModeSelectStep,
  DirectUpdateStep,
  AutoUpdateStep,
} from '../../../../../../../src/cli/tui/components/docs/components/update/index.js';
import { AffectedDoc } from '../../../../../../../src/domain/doc.js';

describe('Subcomponentes Visuais do Modal de Atualização', () => {
  describe('UpdateModeSelectStep', () => {
    it('renderiza as duas opções de atualização com descrições detalhadas', () => {
      const { lastFrame } = render(
        <UpdateModeSelectStep selectedMode="direct" selectedDocName="architecture" />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('1. Atualizar documento selecionado diretamente');
      expect(output).toContain('2. Detectar automaticamente via Git e Escopo do Manifest');
      expect(output).toContain('Documento alvo:');
      expect(output).toContain('architecture.md');
      expect(output).toContain('A IA inspecionará o documento e o código');
      expect(output).toContain('Analisa as alterações recentes no Git');
    });

    it('indica visualmente a seleção do modo direto com (•) na opção 1 e ( ) na opção 2', () => {
      const { lastFrame } = render(
        <UpdateModeSelectStep selectedMode="direct" selectedDocName="api-reference" />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('(•)');
      expect(output).toContain('( )');
      // Opção 1 deve estar selecionada
      expect(output).toMatch(/\(•\)\s+1\. Atualizar documento selecionado diretamente/);
      expect(output).toMatch(/\(\s\)\s+2\. Detectar automaticamente/);
    });

    it('indica visualmente a seleção do modo automático com (•) na opção 2 e ( ) na opção 1', () => {
      const { lastFrame } = render(
        <UpdateModeSelectStep selectedMode="auto" selectedDocName="architecture" />
      );
      const output = lastFrame() ?? '';

      expect(output).toMatch(/\(\s\)\s+1\. Atualizar documento selecionado diretamente/);
      expect(output).toMatch(/\(•\)\s+2\. Detectar automaticamente via Git e Escopo do Manifest/);
    });

    it('exibe a barra inferior de atalhos correta', () => {
      const { lastFrame } = render(<UpdateModeSelectStep />);
      const output = lastFrame() ?? '';

      expect(output).toContain('[↑/↓ ou j/k] Navegar · [Enter] Avançar · [Esc] Cancelar');
    });
  });

  describe('DirectUpdateStep', () => {
    it('exibe o documento alvo em destaque e o seletor horizontal de especificações', () => {
      const { lastFrame } = render(
        <DirectUpdateStep
          docName="architecture"
          availableSpecs={['tui', 'decouple']}
          selectedSpec="tui"
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Documento Alvo:');
      expect(output).toContain('architecture.md');
      expect(output).toContain('Spec de Referência:');
      expect(output).toContain('● tui');
      expect(output).toContain('○ decouple');
      expect(output).toMatch(/\[.*● tui.*○ decouple.*\]/);
    });

    it('permite alternar o destaque horizontal da especificação ativa', () => {
      const { lastFrame } = render(
        <DirectUpdateStep
          docName="architecture"
          availableSpecs={['tui', 'decouple']}
          selectedSpec="decouple"
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('○ tui');
      expect(output).toContain('● decouple');
    });

    it('exibe mensagem indicando ausência de especificações disponíveis quando a lista estiver vazia', () => {
      const { lastFrame } = render(
        <DirectUpdateStep docName="architecture" availableSpecs={[]} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[Nenhuma spec disponível]');
    });

    it('exibe os atalhos de navegação e confirmação correspondentes', () => {
      const { lastFrame } = render(
        <DirectUpdateStep docName="architecture" availableSpecs={['tui']} />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[Space/←/→] Selecionar Spec · [Enter] Atualizar · [Esc] Voltar');
    });

    it('exibe feedback de erro e carregamento quando fornecidos', () => {
      const { lastFrame: errorFrame } = render(
        <DirectUpdateStep docName="doc" error="Falha ao carregar spec" />
      );
      expect(errorFrame() ?? '').toContain('Falha ao carregar spec');

      const { lastFrame: loadingFrame } = render(
        <DirectUpdateStep docName="doc" isLoading={true} />
      );
      expect(loadingFrame() ?? '').toContain('Preparando atualização manual');
    });
  });

  describe('AutoUpdateStep', () => {
    const mockAffectedDocs: AffectedDoc[] = [
      {
        docName: 'architecture',
        docPath: '.codeforge/docs/architecture.md',
        specPaths: ['.codeforge/specs/tui/spec.md'],
        matchedFiles: ['src/cli/tui/App.tsx', 'src/cli/tui/Docs.tsx', 'src/cli/index.ts'],
      },
      {
        docName: 'security',
        docPath: '.codeforge/docs/security.md',
        specPaths: ['.codeforge/specs/tui/spec.md'],
        matchedFiles: ['src/security/auth.ts'],
      },
    ];

    it('exibe a spec de referência associada', () => {
      const { lastFrame } = render(
        <AutoUpdateStep
          selectedSpec="refator-doc-tui"
          status="affected-docs"
          affectedDocs={mockAffectedDocs}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Spec de Referência:');
      expect(output).toContain('refator-doc-tui');
    });

    it('exibe alerta claro para caso de borda: repositório Git não encontrado (no-git)', () => {
      const { lastFrame } = render(
        <AutoUpdateStep selectedSpec="refator-doc-tui" status="no-git" />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Repositório Git não encontrado (no-git)');
      expect(output).toContain('requer um repositório Git');
      expect(output).toContain('[Esc] Voltar');
      expect(output).not.toContain('[Enter] Atualizar');
    });

    it('exibe alerta claro para caso de borda: ausência de modificações no Git (no-changed-files)', () => {
      const { lastFrame } = render(
        <AutoUpdateStep selectedSpec="refator-doc-tui" status="no-changed-files" />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Ausência de modificações no Git (no-changed-files)');
      expect(output).toContain('Não há arquivos modificados');
      expect(output).toContain('[Esc] Voltar');
    });

    it('exibe alerta claro para caso de borda: ausência de documentos impactados (no-affected-docs)', () => {
      const { lastFrame } = render(
        <AutoUpdateStep selectedSpec="refator-doc-tui" status="no-affected-docs" />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('Ausência de documentos impactados (no-affected-docs)');
      expect(output).toContain('Nenhum documento cadastrado no manifest');
      expect(output).toContain('[Esc] Voltar');
    });

    it('exibe a opção em lote e a lista de documentos afetados com a contagem de arquivos', () => {
      const { lastFrame } = render(
        <AutoUpdateStep
          selectedSpec="refator-doc-tui"
          status="affected-docs"
          affectedDocs={mockAffectedDocs}
          selectedIndex={0}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('[ Atualizar todos os 2 afetados ]');
      expect(output).toContain('● [ Atualizar todos os 2 afetados ]');
      expect(output).toContain('architecture');
      expect(output).toContain('(3 arquivos alterados)');
      expect(output).toContain('security');
      expect(output).toContain('(1 arquivo alterado)');
      expect(output).toContain('[Enter] Atualizar · [Esc] Voltar');
    });

    it('destaca o documento individual selecionado quando selectedIndex for maior que 0', () => {
      const { lastFrame } = render(
        <AutoUpdateStep
          selectedSpec="refator-doc-tui"
          status="affected-docs"
          affectedDocs={mockAffectedDocs}
          selectedIndex={1}
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('○ [ Atualizar todos os 2 afetados ]');
      expect(output).toContain('● architecture');
      expect(output).toContain('(3 arquivos alterados)');
      expect(output).toContain('○ security');
    });

    it('suporta seleção direta através da prop selectedTarget', () => {
      const { lastFrame } = render(
        <AutoUpdateStep
          selectedSpec="refator-doc-tui"
          status="affected-docs"
          affectedDocs={mockAffectedDocs}
          selectedTarget="security"
        />
      );
      const output = lastFrame() ?? '';

      expect(output).toContain('○ [ Atualizar todos os 2 afetados ]');
      expect(output).toContain('○ architecture');
      expect(output).toContain('● security');
    });

    it('exibe mensagens de carregamento e erro sem quebrar a interface', () => {
      const { lastFrame: loadingFrame } = render(
        <AutoUpdateStep selectedSpec="tui" status="loading" />
      );
      expect(loadingFrame() ?? '').toContain('Analisando alterações do Git');

      const { lastFrame: errorFrame } = render(
        <AutoUpdateStep selectedSpec="tui" status="error" error="Falha ao executar git diff" />
      );
      expect(errorFrame() ?? '').toContain('Falha ao executar git diff');
    });
  });
});
