import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../../../theme.js';
import { translate } from '../../../../ui/i18n.js';
import { SupportedLanguage } from '../../../../../config/types.js';

export interface WelcomeStepProps {
  onStart: () => void;
  onExit: () => void;
  isActive?: boolean;
  language?: SupportedLanguage;
}

/** CODEFORGE ANSI Shadow logo with vertical gradient between accent and primary colors. */
const logoArt = [
  {
    color: theme.colors.accent,
    text: '   ██████╗ ██████╗ ██████╗ ███████╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗',
  },
  {
    color: theme.colors.accent,
    text: '  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝',
  },
  {
    color: theme.colors.primary,
    text: '  ██║     ██║   ██║██║  ██║█████╗  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ',
  },
  {
    color: theme.colors.primary,
    text: '  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ',
  },
  {
    color: theme.colors.primary,
    text: '  ╚██████╗╚██████╔╝██████╔╝███████╗██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗',
  },
  {
    color: theme.colors.primary,
    text: '   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
  },
] as const;

/** Autonomous development pipeline execution stages. */
const pipelineSteps = [
  { label: 'Intent', isHighlight: false },
  { label: 'Plan', isHighlight: false },
  { label: 'DAG', isHighlight: false },
  { label: 'Parallel Execution', isHighlight: false },
  { label: 'Verify', isHighlight: false },
  { label: 'Docs', isHighlight: false },
  { label: 'Ship', isHighlight: true },
];

/** First screen (splash screen) of the CodeForge onboarding wizard. */
export function WelcomeStep({
  onStart,
  onExit,
  isActive = true,
  language = 'en',
}: WelcomeStepProps) {
  useInput(
    (input, key) => {
      if (key.return || input === '\r' || input === '\n') {
        onStart();
        return;
      }

      if (key.escape || input.toLowerCase() === 'q') {
        onExit();
      }
    },
    { isActive },
  );

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      borderStyle="round"
      borderColor={theme.colors.borderSubtle}
      width="100%"
      height="100%"
      paddingX={2}
      paddingY={1}
    >
      {/* CodeForge ASCII logo */}
      <Box flexDirection="column" alignItems="flex-start">
        {logoArt.map((row, index) => (
          <Text key={index} color={row.color}>
            {row.text}
          </Text>
        ))}
      </Box>

      {/* Tagline */}
      <Box marginTop={1}>
        <Text bold color={theme.colors.text}>
          {translate('onboarding_welcome_tagline', language)}
        </Text>
      </Box>

      {/* Execution pipeline */}
      <Box
        marginTop={1}
        flexDirection="row"
        gap={1}
        justifyContent="center"
        flexWrap="wrap"
      >
        {pipelineSteps.map((step, idx) => (
          <Box key={step.label} flexDirection="row" gap={1}>
            <Text
              bold={step.isHighlight}
              color={
                step.isHighlight ? theme.colors.success : theme.colors.accent
              }
            >
              {step.label}
            </Text>
            {idx < pipelineSteps.length - 1 && (
              <Text color={theme.colors.muted}>{'->'}</Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Navigation action hints */}
      <Box marginTop={1} gap={1} justifyContent="center" flexWrap="wrap">
        <Text bold color={theme.colors.success}>
          {translate('onboarding_welcome_start', language)}
        </Text>
        <Text color={theme.colors.borderSubtle}>│</Text>
        <Text color={theme.colors.error}>
          {translate('onboarding_welcome_exit', language)}
        </Text>
      </Box>
    </Box>
  );
}

export default WelcomeStep;
