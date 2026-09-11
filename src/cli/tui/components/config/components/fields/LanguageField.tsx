import React from 'react';
import { Box, Text } from 'ink';
import { SupportedLanguage } from '../../../../../../config/types.js';
import type { ConfigFieldProps } from '../ConfigField.js';

export const LANGUAGES: SupportedLanguage[] = ['en', 'pt', 'es'];

export const LanguageField: React.FC<ConfigFieldProps> = ({
  isActive,
  config,
}) => {
  return (
    <Box width="100%">
      <Box gap={1}>
        <Text bold color={isActive ? 'cyan' : 'white'}>
          1. Language (i18n):
        </Text>
        <Box gap={1}>
          {LANGUAGES.map((lang) => {
            const isSelected = config.language === lang;
            return (
              <Text
                key={lang}
                color={isSelected ? 'cyan' : 'gray'}
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