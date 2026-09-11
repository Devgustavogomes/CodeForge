import React from 'react';
import { Box, Text } from 'ink';
import { SpecSourceFactory } from '../../../../../infrastructure/spec-sources/SpecSourceFactory.js';

export type SpecSourceFormField = 'provider' | 'project' | 'team' | 'apiKey' | 'save';

export const SPEC_SOURCE_FORM_FIELDS: SpecSourceFormField[] = [
  'provider',
  'project',
  'team',
  'apiKey',
  'save',
];

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

  const getProviderDescription = (p: string) => {
    switch (p.toLowerCase()) {
      case 'filesystem':
        return 'Opera em arquivos .md locais na pasta .codeforge/specs/.';
      case 'github':
        return 'Importa issues do GitHub. Requer repositório (project: owner/repo) e apiKey ($GITHUB_TOKEN).';
      case 'linear':
        return 'Importa issues do Linear. Requer apiKey ($LINEAR_API_KEY) e opcionalmente team.';
      case 'clickup':
        return 'Importa tarefas do ClickUp. Requer apiKey ($CLICKUP_API_KEY), project (list ID) e team (team ID).';
      default:
        return 'Provedor de especificações customizado.';
    }
  };

  const getProjectPlaceholder = () => {
    switch (provider.toLowerCase()) {
      case 'github':
        return 'ex: owner/repo (ex: org/projeto)';
      case 'clickup':
        return 'ex: 9012001234 (List ID)';
      default:
        return '(opcional para este provedor)';
    }
  };

  const getTeamPlaceholder = () => {
    switch (provider.toLowerCase()) {
      case 'linear':
        return 'ex: ENG (identificador ou time)';
      case 'clickup':
        return 'ex: 12345678 (Team/Workspace ID)';
      default:
        return '(opcional para este provedor)';
    }
  };

  const getApiKeyPlaceholder = () => {
    switch (provider.toLowerCase()) {
      case 'github':
        return 'ex: $GITHUB_TOKEN ou ghp_...';
      case 'linear':
        return 'ex: $LINEAR_API_KEY ou lin_api_...';
      case 'clickup':
        return 'ex: $CLICKUP_API_KEY ou pk_...';
      default:
        return '(não obrigatório para filesystem)';
    }
  };

  return (
    <Box flexDirection="column" width="100%">
      {/* Campo 1: Provedor (provider) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'provider' ? 'cyan' : 'white'}
          >
            1. Provedor:
          </Text>
          <Box gap={1} alignItems="center" flexWrap="wrap">
            {availableProviders.map((p) => {
              const isSelected = provider.toLowerCase() === p.toLowerCase();
              return (
                <Text
                  key={p}
                  color={isSelected ? 'cyan' : 'gray'}
                  bold={isSelected}
                >
                  {isSelected ? `● [${p}]` : `○ ${p}`}
                </Text>
              );
            })}
          </Box>
        </Box>
        <Text dimColor wrap="truncate-end">
          {getProviderDescription(provider)}
        </Text>
      </Box>

      {/* Campo 2: Projeto / Repositório (project) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'project' ? 'cyan' : 'white'}
          >
            2. Projeto / Repo (project):
          </Text>
          {currentActiveField === 'project' ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {project.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {project}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor wrap="truncate-end">
                    {getProjectPlaceholder()}
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text
              color={project ? 'white' : 'gray'}
              wrap="truncate-end"
            >
              {project || getProjectPlaceholder()}
            </Text>
          )}
        </Box>
        <Text dimColor>
          GitHub: &apos;owner/repo&apos; | ClickUp: List ID.
        </Text>
      </Box>

      {/* Campo 3: Time / Workspace (team) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'team' ? 'cyan' : 'white'}
          >
            3. Time / Workspace (team):
          </Text>
          {currentActiveField === 'team' ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {team.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {team}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor wrap="truncate-end">
                    {getTeamPlaceholder()}
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text
              color={team ? 'white' : 'gray'}
              wrap="truncate-end"
            >
              {team || getTeamPlaceholder()}
            </Text>
          )}
        </Box>
        <Text dimColor>
          Linear: Sigla ou ID do Time | ClickUp: Team ID.
        </Text>
      </Box>

      {/* Campo 4: Chave de API / Token (apiKey) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text
            bold
            color={currentActiveField === 'apiKey' ? 'cyan' : 'white'}
          >
            4. Chave de API (apiKey):
          </Text>
          {currentActiveField === 'apiKey' ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {apiKey.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {apiKey}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor wrap="truncate-end">
                    {getApiKeyPlaceholder()}
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text
              color={apiKey ? 'white' : 'gray'}
              wrap="truncate-end"
            >
              {apiKey ? (apiKey.startsWith('$') ? apiKey : '••••••••') : getApiKeyPlaceholder()}
            </Text>
          )}
        </Box>
        <Text dimColor wrap="truncate-end">
          {SpecSourceFactory.getDefaultApiKey(provider)
            ? `Padrão: ${SpecSourceFactory.getDefaultApiKey(provider)} (altere apenas se desejar). Carrega de .codeforge/.env ou .env da raiz.`
            : 'Recomendado usar $VAR para carregar de .codeforge/.env ou .env da raiz.'}
        </Text>
      </Box>

      {/* Botão [ Salvar Spec Source ] */}
      <Box marginBottom={1}>
        <Box
          borderStyle="round"
          borderColor={currentActiveField === 'save' ? 'cyan' : 'gray'}
          paddingX={2}
          alignSelf="flex-start"
        >
          <Text
            bold={currentActiveField === 'save'}
            color={currentActiveField === 'save' ? 'cyan' : 'gray'}
          >
            [ Salvar Spec Source ]
          </Text>
        </Box>
      </Box>

      {/* Mensagem de Erro */}
      {errorMessage && (
        <Box marginBottom={1}>
          <Text color="red" bold>
            ✗ {errorMessage}
          </Text>
        </Box>
      )}

      {/* Barra de Atalhos */}
      <Box
        marginTop={0}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        justifyContent="space-between"
        width="100%"
      >
        <Text dimColor>[Tab / Shift+Tab ou ↑/↓] Alternar campo</Text>
        <Text dimColor>[Space ou ←/→] Alternar provedor</Text>
        <Text dimColor>[Enter] Salvar</Text>
        <Text dimColor>[Esc] Cancelar</Text>
      </Box>
    </Box>
  );
};
