import React from 'react';
import { Box, Text } from 'ink';
import { HookEvent, HookType } from '../../../../../domain/hook.js';

export type HookFormField = 'run' | 'type' | 'name' | 'save';

export const HOOK_FORM_FIELDS: HookFormField[] = ['run', 'type', 'name', 'save'];

export interface HookFormData {
  run: string;
  type: HookType;
  name?: string;
}

export interface HookFormProps {
  event: HookEvent;
  activeField?: HookFormField;
  activeFieldIndex?: number;
  run?: string;
  type?: HookType;
  name?: string;
  values?: Partial<HookFormData>;
  formData?: Partial<HookFormData>;
  isEditing?: boolean;
  errorMessage?: string | null;
  onChangeRun?: (val: string) => void;
  onChangeType?: (type: HookType) => void;
  onChangeName?: (val: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}

/**
 * Nível 3 - Formulário de Criação e Edição de Comando de Hook.
 * Possui 3 campos (run, type, name) e botão de submissão (save),
 * com indicadores de foco, texto explicativo e validação visual.
 */
export const HookForm: React.FC<HookFormProps> = ({
  event,
  activeField,
  activeFieldIndex,
  run,
  type,
  name,
  values,
  formData,
  isEditing = false,
  errorMessage,
}) => {
  const currentActiveField: HookFormField =
    activeField ??
    (activeFieldIndex !== undefined
      ? HOOK_FORM_FIELDS[activeFieldIndex] ?? 'run'
      : 'run');

  const currentRun = run ?? values?.run ?? formData?.run ?? '';
  const currentType = type ?? values?.type ?? formData?.type ?? 'notify';
  const currentName = name ?? values?.name ?? formData?.name ?? '';

  const autoNamePlaceholder = currentRun.trim()
    ? currentRun.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9_-]/g, '-')
    : `${event}-hook`;

  return (
    <Box flexDirection="column" width="100%">
      {/* Cabeçalho */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          {isEditing ? 'Editar Hook' : 'Adicionar Novo Hook'} — {event}
        </Text>
        <Text dimColor>
          Configure os parâmetros do comando e o modo de execução.
        </Text>
      </Box>

      {/* Campo 1: Comando (run) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center">
          <Text
            bold
            color={currentActiveField === 'run' ? 'cyan' : 'white'}
          >
            Comando (run) *:
          </Text>
          {currentActiveField === 'run' ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {currentRun.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {currentRun}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor wrap="truncate-end">
                    ex: npm run lint, pytest tests/unit
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text
              color={currentRun ? 'white' : 'gray'}
              wrap="truncate-end"
            >
              {currentRun || '(vazio - obrigatório: ex: npm test)'}
            </Text>
          )}
        </Box>
        <Text dimColor>
          Linha de comando shell executada no evento.
        </Text>
      </Box>

      {/* Campo 2: Tipo (type) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center">
          <Text
            bold
            color={currentActiveField === 'type' ? 'cyan' : 'white'}
          >
            Tipo (type):
          </Text>
          <Box gap={2} alignItems="center">
            <Text
              color={currentType === 'gate' ? 'yellow' : 'gray'}
              bold={currentType === 'gate'}
            >
              {currentType === 'gate' ? '● [GATE]' : '○ GATE'}
            </Text>
            <Text
              color={currentType === 'notify' ? 'green' : 'gray'}
              bold={currentType === 'notify'}
            >
              {currentType === 'notify' ? '● [NOTIFY]' : '○ NOTIFY'}
            </Text>
          </Box>
          {currentActiveField === 'type' && (
            <Text dimColor>[Space ou ←/→] Alternar tipo</Text>
          )}
        </Box>
        <Box marginY={0}>
          <Text dimColor>
            {currentType === 'gate'
              ? 'gate: Falha no comando interrompe e veta a tarefa'
              : 'notify: Informa o resultado nos logs sem interromper'}
          </Text>
        </Box>
      </Box>

      {/* Campo 3: Nome (name) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center">
          <Text
            bold
            color={currentActiveField === 'name' ? 'cyan' : 'white'}
          >
            Nome (name):
          </Text>
          {currentActiveField === 'name' ? (
            <Box gap={1}>
              <Text color="blue" bold>
                {'> '}
              </Text>
              {currentName.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {currentName}█
                </Text>
              ) : (
                <Box gap={1}>
                  <Text color="cyan">█</Text>
                  <Text dimColor wrap="truncate-end">
                    (opcional: derivado automaticamente como "{autoNamePlaceholder}" se vazio)
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text
              color={currentName ? 'white' : 'gray'}
              wrap="truncate-end"
            >
              {currentName || `(auto: ${autoNamePlaceholder})`}
            </Text>
          )}
        </Box>
        <Text dimColor>
          Identificador amigável para exibição nos logs e relatórios.
        </Text>
      </Box>

      {/* Botão [ Salvar Hook ] */}
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
            [ Salvar Hook ]
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
        <Text dimColor>[Space ou ←/→] Alternar tipo</Text>
        <Text dimColor>[Enter] Salvar</Text>
        <Text dimColor>[Esc] Cancelar</Text>
      </Box>
    </Box>
  );
};
