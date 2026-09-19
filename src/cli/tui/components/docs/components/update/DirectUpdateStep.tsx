import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { translate } from '../../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../../config/types.js';
import { theme } from '../../../../theme.js';

export interface DirectUpdateStepProps {
  docName?: string;
  selectedDoc?: string;
  availableIntents?: string[];
  selectedIntent?: string;
  width?: string | number;
  error?: string | null;
  isLoading?: boolean;
  language?: SupportedLanguage;
}

/**
 * Subcomponente visual para a Etapa 2A do modal de atualização:
 * Permite a revisão do documento alvo e a seleção horizontal da intent de referência.
 */
export const DirectUpdateStep: React.FC<DirectUpdateStepProps> = memo(({
  docName,
  selectedDoc,
  availableIntents = [],
  selectedIntent,
  width = '100%',
  error,
  isLoading = false,
  language = 'en',
}) => {
  const targetDoc = docName ?? selectedDoc ?? 'document';
  const formattedDoc = targetDoc.endsWith('.md') ? targetDoc : `${targetDoc}.md`;
  const effectiveSelectedIntent = selectedIntent ?? availableIntents[0];

  return (
    <Box flexDirection="column" width={width} gap={1}>
      {/* Documento Alvo */}
      <Box flexDirection="row" gap={1}>
        <Text bold color={theme.colors.text}>{translate('tui_docs_direct_target_doc', language)}</Text>
        <Text bold color={theme.colors.primary}>{formattedDoc}</Text>
      </Box>

      {/* Seletor horizontal de intenções */}
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text bold color={theme.colors.text}>{translate('tui_docs_direct_ref_intent', language)}</Text>
        {availableIntents.length > 0 ? (
          <Box>
            <Text color={theme.colors.borderSubtle}>[</Text>
            {availableIntents.map((intent, idx) => {
              const isSelected = intent === effectiveSelectedIntent;
              const marker = isSelected ? '●' : '○';
              return (
                <React.Fragment key={intent}>
                  {idx > 0 && <Text>  </Text>}
                  <Text bold={isSelected} color={isSelected ? theme.colors.primary : theme.colors.muted}>
                    {marker} {intent}
                  </Text>
                </React.Fragment>
              );
            })}
            <Text color={theme.colors.borderSubtle}>]</Text>
          </Box>
        ) : (
          <Text color={theme.colors.muted}>{translate('tui_docs_direct_no_intents', language)}</Text>
        )}
      </Box>

      {/* Descrição informativa */}
      <Box>
        <Text color={theme.colors.muted}>
          {translate('tui_docs_direct_desc', language)}
        </Text>
      </Box>

      {/* Feedback de loading ou erro */}
      {isLoading && (
        <Box>
          <Text color={theme.colors.warning}>{translate('tui_docs_direct_loading', language)}</Text>
        </Box>
      )}
      {error && (
        <Box>
          <Text color={theme.colors.error} bold>✗ {error}</Text>
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
          <Text color={theme.colors.muted}>{translate('tui_docs_direct_shortcuts', language)}</Text>
          <Text bold color={theme.colors.error}>{translate('tui_docs_direct_back', language)}</Text>
        </Text>
      </Box>
    </Box>
  );
});

DirectUpdateStep.displayName = 'DirectUpdateStep';

export default DirectUpdateStep;
