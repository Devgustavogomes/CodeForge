import React from 'react';
import { Box, Text } from 'ink';
import { SpecSourceFactory } from '../../../../../infrastructure/spec-sources/SpecSourceFactory.js';
import { TextInput } from '../../common/TextInput.js';
import { theme } from '../../../theme.js';

export type SpecSourceFormField = 'provider' | 'project' | 'team' | 'apiKey' | 'save';

export const SPEC_SOURCE_FORM_FIELDS: SpecSourceFormField[] = [
  'provider',
  'project',
  'team',
  'apiKey',
  'save',
];

export interface ProviderDescriptor {
  description: string;
  projectPlaceholder: string;
  teamPlaceholder: string;
  apiKeyPlaceholder: string;
}

export const DEFAULT_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  description: 'Provedor de especificações customizado.',
  projectPlaceholder: '(opcional para este provedor)',
  teamPlaceholder: '(opcional para este provedor)',
  apiKeyPlaceholder: '(não obrigatório para filesystem)',
};

export const SPEC_SOURCE_PROVIDERS_META: Record<string, ProviderDescriptor> = {
  filesystem: {
    description: 'Opera em arquivos .md locais na pasta .codeforge/specs/.',
    projectPlaceholder: '(opcional para este provedor)',
    teamPlaceholder: '(opcional para este provedor)',
    apiKeyPlaceholder: '(não obrigatório para filesystem)',
  },
  github: {
    description: 'Importa issues do GitHub. Requer repositório (project: owner/repo) e apiKey ($GITHUB_TOKEN).',
    projectPlaceholder: 'ex: owner/repo (ex: org/projeto)',
    teamPlaceholder: '(opcional para este provedor)',
    apiKeyPlaceholder: 'ex: $GITHUB_TOKEN ou ghp_...',
  },
  linear: {
    description: 'Importa issues do Linear. Requer apiKey ($LINEAR_API_KEY) e opcionalmente team.',
    projectPlaceholder: '(opcional para este provedor)',
    teamPlaceholder: 'ex: ENG (identificador ou time)',
    apiKeyPlaceholder: 'ex: $LINEAR_API_KEY ou lin_api_...',
  },
  clickup: {
    description: 'Importa tarefas do ClickUp. Requer apiKey ($CLICKUP_API_KEY), project (list ID) e team (team ID).',
    projectPlaceholder: 'ex: 9012001234 (List ID)',
    teamPlaceholder: 'ex: 12345678 (Team/Workspace ID)',
    apiKeyPlaceholder: 'ex: $CLICKUP_API_KEY ou pk_...',
  },
};

export interface SpecSourceFormProps {
  activeField?: SpecSourceFormField;
  activeFieldIndex?: number;
  provider: string;
  project: string;
  team: string;
  apiKey: string;
  availableProviders?: string[];
  errorMessage?: string | null;
  onChangeProvider?: (provider: string) => void;
  onChangeProject?: (project: string) => void;
  onChangeTeam?: (team: string) => void;
  onChangeApiKey?: (apiKey: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}

const DEFAULT_PROVIDERS = ['filesystem', 'linear', 'github', 'clickup'];

export const SpecSourceForm: React.FC<SpecSourceFormProps> = ({
  activeField,
  activeFieldIndex,
  provider,
  project,
  team,
  apiKey,
  availableProviders = DEFAULT_PROVIDERS,
  errorMessage,
}) => {
  const currentActiveField: SpecSourceFormField =
    activeField ??
    (activeFieldIndex !== undefined
      ? SPEC_SOURCE_FORM_FIELDS[activeFieldIndex] ?? 'provider'
      : 'provider');

  const meta = SPEC_SOURCE_PROVIDERS_META[provider.toLowerCase()] ?? DEFAULT_PROVIDER_DESCRIPTOR;

  return (
    <Box flexDirection="column" width="100%">
      {/* Campo 1: Provedor (provider) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'provider' ? theme.colors.primary : theme.colors.text}
          >
            1. Provedor:
          </Text>
          <Box gap={1} alignItems="center" flexWrap="wrap">
            {availableProviders.map((p) => {
              const isSelected = provider.toLowerCase() === p.toLowerCase();
              return (
                <Text
                  key={p}
                  color={isSelected ? theme.colors.primary : theme.colors.muted}
                  bold={isSelected}
                >
                  {isSelected ? `● [${p}]` : `○ ${p}`}
                </Text>
              );
            })}
          </Box>
        </Box>
        <Text color={theme.colors.muted} wrap="truncate-end">
          {meta.description}
        </Text>
      </Box>

      {/* Campo 2: Projeto / Repositório (project) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'project' ? theme.colors.primary : theme.colors.text}
          >
            2. Projeto / Repo (project):
          </Text>
          {currentActiveField === 'project' ? (
            <Box gap={1}>
              <Text color={theme.colors.primary} bold>
                {'> '}
              </Text>
              <TextInput
                value={project}
                placeholder={meta.projectPlaceholder}
                isFocused={true}
                cursorColor={theme.colors.primary}
              />
            </Box>
          ) : (
            <Text
              color={project ? theme.colors.text : theme.colors.muted}
              wrap="truncate-end"
            >
              {project || meta.projectPlaceholder}
            </Text>
          )}
        </Box>
        <Text color={theme.colors.muted}>
          GitHub: &apos;owner/repo&apos; | ClickUp: List ID.
        </Text>
      </Box>

      {/* Campo 3: Time / Workspace (team) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'team' ? theme.colors.primary : theme.colors.text}
          >
            3. Time / Workspace (team):
          </Text>
          {currentActiveField === 'team' ? (
            <Box gap={1}>
              <Text color={theme.colors.primary} bold>
                {'> '}
              </Text>
              <TextInput
                value={team}
                placeholder={meta.teamPlaceholder}
                isFocused={true}
                cursorColor={theme.colors.primary}
              />
            </Box>
          ) : (
            <Text
              color={team ? theme.colors.text : theme.colors.muted}
              wrap="truncate-end"
            >
              {team || meta.teamPlaceholder}
            </Text>
          )}
        </Box>
        <Text color={theme.colors.muted}>
          Linear: Sigla ou ID do Time | ClickUp: Team ID.
        </Text>
      </Box>

      {/* Campo 4: Chave de API / Token (apiKey) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'apiKey' ? theme.colors.primary : theme.colors.text}
          >
            4. Chave de API (apiKey):
          </Text>
          {currentActiveField === 'apiKey' ? (
            <Box gap={1}>
              <Text color={theme.colors.primary} bold>
                {'> '}
              </Text>
              <TextInput
                value={apiKey}
                placeholder={meta.apiKeyPlaceholder}
                isFocused={true}
                cursorColor={theme.colors.primary}
              />
            </Box>
          ) : (
            <Text
              color={apiKey ? theme.colors.text : theme.colors.muted}
              wrap="truncate-end"
            >
              {apiKey ? (apiKey.startsWith('$') ? apiKey : '••••••••') : meta.apiKeyPlaceholder}
            </Text>
          )}
        </Box>
        <Text color={theme.colors.muted} wrap="truncate-end">
          {SpecSourceFactory.getDefaultApiKey(provider)
            ? `Padrão: ${SpecSourceFactory.getDefaultApiKey(provider)} (altere apenas se desejar). Carrega de .codeforge/.env ou .env da raiz.`
            : 'Recomendado usar $VAR para carregar de .codeforge/.env ou .env da raiz.'}
        </Text>
      </Box>

      {/* Botão [ Salvar Spec Source ] */}
      <Box marginBottom={1}>
        <Box
          borderStyle="round"
          borderColor={currentActiveField === 'save' ? theme.colors.borderActive : theme.colors.borderSubtle}
          paddingX={2}
          alignSelf="flex-start"
        >
          <Text
            bold={currentActiveField === 'save'}
            color={currentActiveField === 'save' ? theme.colors.primary : theme.colors.muted}
          >
            [ Salvar Spec Source ]
          </Text>
        </Box>
      </Box>

      {/* Mensagem de Erro */}
      {errorMessage && (
        <Box marginBottom={1}>
          <Text color={theme.colors.error} bold>
            ✗ {errorMessage}
          </Text>
        </Box>
      )}

      {/* Barra de Atalhos */}
      <Box
        marginTop={0}
        borderStyle="single"
        borderColor={theme.colors.borderSubtle}
        paddingX={1}
        justifyContent="space-between"
        width="100%"
      >
        <Text color={theme.colors.muted}>[Tab / Shift+Tab ou ↑/↓] Alternar campo</Text>
        <Text color={theme.colors.muted}>[Space ou ←/→] Alternar provedor</Text>
        <Text color={theme.colors.muted}>[Enter] Salvar</Text>
        <Text color={theme.colors.muted}>[Esc] Cancelar</Text>
      </Box>
    </Box>
  );
};
