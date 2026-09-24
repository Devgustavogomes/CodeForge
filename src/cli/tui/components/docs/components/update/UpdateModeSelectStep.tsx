import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { translate } from '../../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../../config/types.js';
import { theme } from '../../../../theme.js';

export type UpdateMode = 'direct' | 'auto';

export interface UpdateModeSelectStepProps {
  selectedMode?: UpdateMode;
  selectedDocName?: string;
  selectedDoc?: string;
  width?: string | number;
  language?: SupportedLanguage;
}

/**
 * Subcomponente visual para a Etapa 1 do modal de atualização:
 * Permite a seleção entre Modo Direto (manual) e Modo Automático (Git / escopo).
 */
export const UpdateModeSelectStep: React.FC<UpdateModeSelectStepProps> = memo(({
  selectedMode = 'direct',
  selectedDocName,
  selectedDoc,
  width = '100%',
  language = 'en',
}) => {
  const docName = selectedDocName ?? selectedDoc ?? '';
  const formattedDoc = docName ? (docName.endsWith('.md') ? docName : `${docName}.md`) : '';
  const isDirect = selectedMode === 'direct';
  const isAuto = selectedMode === 'auto';

  return (
    <Box flexDirection="column" width={width} gap={1}>
      {/* Opção 1: Atualizar documento selecionado diretamente */}
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color={isDirect ? theme.colors.primary : theme.colors.muted} bold={isDirect}>
            {isDirect ? '(•)' : '( )'}
          </Text>
          <Text bold={isDirect} color={isDirect ? theme.colors.primary : theme.colors.text}>
            {translate('tui_docs_mode_direct_title', language)}
          </Text>
        </Box>
        <Box paddingLeft={4} flexDirection="column">
          {formattedDoc ? (
            <Box gap={1}>
              <Text color={theme.colors.muted}>{translate('tui_docs_mode_direct_target', language)}</Text>
              <Text bold color={theme.colors.primary}>{formattedDoc}</Text>
            </Box>
          ) : null}
          <Text color={theme.colors.muted}>
            {translate('tui_docs_mode_direct_desc', language)}
          </Text>
        </Box>
      </Box>

      {/* Opção 2: Detectar automaticamente via Git e Escopo do Manifest */}
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color={isAuto ? theme.colors.primary : theme.colors.muted} bold={isAuto}>
            {isAuto ? '(•)' : '( )'}
          </Text>
          <Text bold={isAuto} color={isAuto ? theme.colors.primary : theme.colors.text}>
            {translate('tui_docs_mode_auto_title', language)}
          </Text>
        </Box>
        <Box paddingLeft={4} flexDirection="column">
          <Text color={theme.colors.muted}>
            {translate('tui_docs_mode_auto_desc', language)}
          </Text>
        </Box>
      </Box>

      {/* Barra de atalhos */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        width="100%"
      >
        <Text>
          <Text color={theme.colors.muted}>{translate('tui_docs_mode_shortcuts', language)}</Text>
          <Text bold color={theme.colors.error}>{translate('tui_docs_mode_cancel', language)}</Text>
        </Text>
      </Box>
    </Box>
  );
});

UpdateModeSelectStep.displayName = 'UpdateModeSelectStep';

export default UpdateModeSelectStep;
