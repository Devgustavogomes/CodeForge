import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { AffectedDoc } from '../../../../../../domain/doc.js';
import { translate } from '../../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../../config/types.js';
import { theme } from '../../../../theme.js';

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
  language?: SupportedLanguage;
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
  language = 'en',
}) => {
  const referenceSpec = selectedSpec ?? specName ?? translate('tui_docs_auto_general', language);
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
        <Text bold color={theme.colors.text}>{translate('tui_docs_auto_ref_spec', language)}</Text>
        <Text bold color={theme.colors.primary}>{referenceSpec}</Text>
      </Box>

      {/* Alerta de Loading */}
      {isLoading && (
        <Box marginY={1}>
          <Text color={theme.colors.warning}>{translate('tui_docs_auto_loading', language)}</Text>
        </Box>
      )}

      {/* Alertas de Casos de Borda */}
      {isNoGit && (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={1} marginY={1}>
          <Text bold color={theme.colors.warning}>{translate('tui_docs_auto_no_git_title', language)}</Text>
          <Text color={theme.colors.muted}>{translate('tui_docs_auto_no_git_desc', language)}</Text>
        </Box>
      )}

      {isNoChangedFiles && (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={1} marginY={1}>
          <Text bold color={theme.colors.warning}>{translate('tui_docs_auto_no_changes_title', language)}</Text>
          <Text color={theme.colors.muted}>{translate('tui_docs_auto_no_changes_desc', language)}</Text>
        </Box>
      )}

      {isNoAffectedDocs && (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={1} marginY={1}>
          <Text bold color={theme.colors.warning}>{translate('tui_docs_auto_no_affected_title', language)}</Text>
          <Text color={theme.colors.muted}>{translate('tui_docs_auto_no_affected_desc', language)}</Text>
        </Box>
      )}

      {/* Alerta de Erro */}
      {isError && (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.error} paddingX={1} marginY={1}>
          <Text bold color={theme.colors.error}>{translate('tui_docs_auto_error_title', language)}</Text>
          <Text color={theme.colors.muted}>{error || translate('tui_docs_auto_error_default', language)}</Text>
        </Box>
      )}

      {/* Listagem de Documentos Afetados */}
      {hasAffectedDocs && (
        <Box flexDirection="column" gap={0}>
          <Text color={theme.colors.muted}>{translate('tui_docs_auto_affected_heading', language)}</Text>

          {/* Opção em Lote */}
          <Box gap={1} marginTop={1}>
            <Text color={isAllSelected ? theme.colors.primary : theme.colors.muted} bold={isAllSelected}>
              {isAllSelected ? '●' : '○'}
            </Text>
            <Text bold={isAllSelected} color={isAllSelected ? theme.colors.primary : theme.colors.text}>
              {translate('tui_docs_auto_all_option', language, { count: affectedDocs.length })}
            </Text>
          </Box>

          {/* Documentos Individuais */}
          {affectedDocs.map((doc, idx) => {
            const isDocSelected =
              selectedTarget === doc.docName ||
              (selectedTarget === undefined && selectedIndex === idx + 1);
            const count = doc.matchedFiles?.length ?? 0;
            const countText =
              count === 1
                ? translate('tui_docs_auto_file_count_single', language)
                : translate('tui_docs_auto_file_count_plural', language, { count });

            return (
              <Box key={doc.docName} gap={1}>
                <Text color={isDocSelected ? theme.colors.primary : theme.colors.muted} bold={isDocSelected}>
                  {isDocSelected ? '●' : '○'}
                </Text>
                <Text bold={isDocSelected} color={isDocSelected ? theme.colors.primary : theme.colors.text}>
                  {doc.docName}
                </Text>
                <Text color={isDocSelected ? theme.colors.primary : theme.colors.muted}>
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
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        width="100%"
      >
        <Text>
          {canUpdate ? (
            <>
              <Text color={theme.colors.muted}>{translate('tui_docs_auto_shortcuts_update', language)}</Text>
              <Text bold color={theme.colors.error}>{translate('tui_docs_auto_shortcuts_back', language)}</Text>
            </>
          ) : (
            <Text bold color={theme.colors.error}>{translate('tui_docs_auto_shortcuts_back', language)}</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
});

AutoUpdateStep.displayName = 'AutoUpdateStep';

export default AutoUpdateStep;
