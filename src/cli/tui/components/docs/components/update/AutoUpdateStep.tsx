import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { AffectedDoc } from '../../../../../../domain/doc.js';

export type AutoUpdateStatus =
  | 'idle'
  | 'loading'
  | 'no-git'
  | 'no-changed-files'
  | 'no-affected-docs'
  | 'affected-docs'
  | 'error';

export interface AutoUpdateStepProps {
  selectedSpec?: string;
  specName?: string;
  status?: AutoUpdateStatus | string;
  resultKind?: string;
  affectedDocs?: AffectedDoc[];
  selectedIndex?: number;
  selectedTarget?: 'all' | string;
  width?: string | number;
  error?: string | null;
  showEnterShortcut?: boolean;
}

/**
 * Subcomponente visual para a Etapa 2B do modal de atualização:
 * Exibe a spec de referência, mensagens de alerta para casos de borda do Git/Manifest,
 * e a listagem de documentos impactados com contagem de arquivos para seleção individual ou em lote.
 */
export const AutoUpdateStep: React.FC<AutoUpdateStepProps> = memo(({
  selectedSpec,
  specName,
  status,
  resultKind,
  affectedDocs = [],
  selectedIndex = 0,
  selectedTarget,
  width = '100%',
  error,
  showEnterShortcut,
}) => {
  const referenceSpec = selectedSpec ?? specName ?? 'Geral';
  const effectiveStatus = (resultKind ?? status ?? (affectedDocs.length > 0 ? 'affected-docs' : 'no-affected-docs')) as AutoUpdateStatus;

  const isNoGit = effectiveStatus === 'no-git';
  const isNoChangedFiles = effectiveStatus === 'no-changed-files';
  const isNoAffectedDocs = effectiveStatus === 'no-affected-docs';
  const isLoading = effectiveStatus === 'loading';
  const isError = effectiveStatus === 'error' || Boolean(error);

  const isEdgeCase = isNoGit || isNoChangedFiles || isNoAffectedDocs;
  const hasAffectedDocs = !isEdgeCase && !isLoading && !isError && affectedDocs.length > 0;

  const isAllSelected =
    selectedTarget === 'all' ||
    (selectedTarget === undefined && selectedIndex === 0);

  const canUpdate = showEnterShortcut ?? hasAffectedDocs;

  return (
    <Box flexDirection="column" width={width} gap={1}>
      {/* Spec de Referência Associada */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="white">Spec de Referência:</Text>
        <Text bold color="cyan">{referenceSpec}</Text>
      </Box>

      {/* Alerta de Loading */}
      {isLoading && (
        <Box marginY={1}>
          <Text color="yellow">⏳ Analisando alterações do Git e escopo do manifest...</Text>
        </Box>
      )}

      {/* Alertas de Casos de Borda */}
      {isNoGit && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
          <Text bold color="yellow">⚠ Repositório Git não encontrado (no-git)</Text>
          <Text color="gray">Esta operação requer um repositório Git inicializado para detectar alterações.</Text>
        </Box>
      )}

      {isNoChangedFiles && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
          <Text bold color="yellow">⚠ Ausência de modificações no Git (no-changed-files)</Text>
          <Text color="gray">Não há arquivos modificados detectados no repositório de trabalho.</Text>
        </Box>
      )}

      {isNoAffectedDocs && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginY={1}>
          <Text bold color="yellow">⚠ Ausência de documentos impactados (no-affected-docs)</Text>
          <Text color="gray">Nenhum documento cadastrado no manifest possui escopo cobrindo os arquivos modificados.</Text>
        </Box>
      )}

      {/* Alerta de Erro */}
      {isError && (
        <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1} marginY={1}>
          <Text bold color="red">✗ Erro na análise</Text>
          <Text color="gray">{error || 'Ocorreu um erro ao consultar documentos afetados.'}</Text>
        </Box>
      )}

      {/* Listagem de Documentos Afetados */}
      {hasAffectedDocs && (
        <Box flexDirection="column" gap={0}>
          <Text color="gray">Documentos identificados com alterações de escopo:</Text>

          {/* Opção em Lote */}
          <Box gap={1} marginTop={1}>
            <Text color={isAllSelected ? 'cyan' : 'gray'} bold={isAllSelected}>
              {isAllSelected ? '●' : '○'}
            </Text>
            <Text bold={isAllSelected} color={isAllSelected ? 'cyan' : 'white'}>
              [ Atualizar todos os {affectedDocs.length} afetados ]
            </Text>
          </Box>

          {/* Documentos Individuais */}
          {affectedDocs.map((doc, idx) => {
            const isDocSelected =
              selectedTarget === doc.docName ||
              (selectedTarget === undefined && selectedIndex === idx + 1);
            const count = doc.matchedFiles?.length ?? 0;
            const countText = count === 1 ? '1 arquivo alterado' : `${count} arquivos alterados`;

            return (
              <Box key={doc.docName} gap={1}>
                <Text color={isDocSelected ? 'cyan' : 'gray'} bold={isDocSelected}>
                  {isDocSelected ? '●' : '○'}
                </Text>
                <Text bold={isDocSelected} color={isDocSelected ? 'cyan' : 'white'}>
                  {doc.docName}
                </Text>
                <Text color={isDocSelected ? 'cyan' : 'gray'}>
                  ({countText})
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Barra de atalhos */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        width="100%"
      >
        <Text>
          {canUpdate ? (
            <>
              <Text dimColor>[Enter] Atualizar · </Text>
              <Text bold color="red">[Esc] Voltar</Text>
            </>
          ) : (
            <Text bold color="red">[Esc] Voltar</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
});

AutoUpdateStep.displayName = 'AutoUpdateStep';

export default AutoUpdateStep;
