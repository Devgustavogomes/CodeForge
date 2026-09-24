import React from 'react';
import { Box, Text } from 'ink';
import { SupportedLanguage } from '../../../../../../config/types.js';
import type { ConfigFieldProps } from '../ConfigField.js';
import { theme } from '../../../../theme.js';

export const LANGUAGES: SupportedLanguage[] = ['en', 'pt', 'es'];

export const LanguageField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
}) => {
  return (
    <Box width="100%">
      <Box gap={1}>
        <Text bold color={isActive ? theme.colors.primary : theme.colors.text}>
          1. Language (i18n):
        </Text>
        <Box gap={1}>
          {LANGUAGES.map((lang) => {
            const isSelected = config.language === lang;
            return (
              <Text
                key={lang}
                color={isSelected ? theme.colors.primary : theme.colors.muted}
                bold={isSelected}
              >
                {isSelected ? `● [${lang}]` : `○ ${lang}`}
              </Text>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
