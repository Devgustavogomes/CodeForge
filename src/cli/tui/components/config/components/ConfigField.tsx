import React from 'react';
import { CodeForgeConfig } from '../../../../../config/types.js';
import { LanguageField, LANGUAGES } from './fields/LanguageField.js';
import { EnvironmentField } from './fields/EnvironmentField.js';
import { AgentField } from './fields/AgentField.js';
import { HooksField } from './fields/HooksField.js';
import { SpecSourceField } from './fields/SpecSourceField.js';
import { SaveButtonField } from './fields/SaveButtonField.js';

export { LANGUAGES };

export type ConfigFieldKey =
  | 'language'
  | 'environment'
  | 'plannerAgent'
  | 'executorAgent'
  | 'hooks'
  | 'specSource'
  | 'saveButton';

export const FIELD_ORDER: ConfigFieldKey[] = [
  'language',
  'environment',
  'plannerAgent',
  'executorAgent',
  'hooks',
  'specSource',
  'saveButton',
];

export interface ConfigFieldProps {
  fieldKey: ConfigFieldKey;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  config: CodeForgeConfig;
  availableEnvironments: string[];
  currentAgentOptions: string[];
  availableSpecSourceProviders?: string[];
}

export const FIELD_STRATEGIES: Record<ConfigFieldKey, React.FC<ConfigFieldProps>> = {
  language: LanguageField,
  environment: EnvironmentField,
  plannerAgent: AgentField,
  executorAgent: AgentField,
  hooks: HooksField,
  specSource: SpecSourceField,
  saveButton: SaveButtonField,
};

export const ConfigField: React.FC<ConfigFieldProps> = (props) => {
  const Strategy = FIELD_STRATEGIES[props.fieldKey];
  if (!Strategy) return null;
  return <Strategy {...props} />;
};

