import React from 'react';
import { Box, Text } from 'ink';
import { HookEvent, HookType } from '../../../../../domain/hook.js';
import { TextInput } from '../../common/TextInput.js';
import { theme } from '../../../theme.js';

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
        <Text bold color={theme.colors.primary}>
          {isEditing ? 'Editar Hook' : 'Adicionar Novo Hook'} — {event}
        </Text>
        <Text color={theme.colors.muted}>
          Configure os parâmetros do comando e o modo de execução.
        </Text>
      </Box>

      {/* Campo 1: Comando (run) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center">
          <Text
            bold
            color={currentActiveField === 'run' ? theme.colors.primary : theme.colors.text}
          >
            Comando (run) *:
          </Text>
          {currentActiveField === 'run' ? (
            <Box gap={1}>
              <Text color={theme.colors.primary} bold>
                {'> '}
              </Text>
              <TextInput
                value={currentRun}
                placeholder="ex: npm run lint, pytest tests/unit"
                isFocused={true}
                cursorColor={theme.colors.primary}
              />
            </Box>
          ) : (
            <Text
              color={currentRun ? theme.colors.text : theme.colors.muted}
              wrap="truncate-end"
            >
              {currentRun || '(vazio - obrigatório: ex: npm test)'}
            </Text>
          )}
        </Box>
        <Text color={theme.colors.muted}>
          Linha de comando shell executada no evento.
        </Text>
      </Box>

      {/* Campo 2: Tipo (type) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1} alignItems="center">
          <Text
            bold
            color={currentActiveField === 'type' ? theme.colors.primary : theme.colors.text}
          >
            Tipo (type):
          </Text>
          <Box gap={2} alignItems="center">
            <Text
              color={currentType === 'gate' ? theme.colors.warning : theme.colors.muted}
              bold={currentType === 'gate'}
            >
              {currentType === 'gate' ? '● [GATE]' : '○ GATE'}
            </Text>
            <Text
              color={currentType === 'notify' ? theme.colors.success : theme.colors.muted}
              bold={currentType === 'notify'}
            >
              {currentType === 'notify' ? '● [NOTIFY]' : '○ NOTIFY'}
            </Text>
          </Box>
          {currentActiveField === 'type' && (
            <Text color={theme.colors.muted}>[Space ou ←/→] Alternar tipo</Text>
          )}
        </Box>
        <Box marginY={0}>
          <Text color={theme.colors.muted}>
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
            color={currentActiveField === 'name' ? theme.colors.primary : theme.colors.text}
          >
            Nome (name):
          </Text>
          {currentActiveField === 'name' ? (
            <Box gap={1}>
              <Text color={theme.colors.primary} bold>
                {'> '}
              </Text>
              <TextInput
                value={currentName}
                placeholder={`(opcional: derivado automaticamente como "${autoNamePlaceholder}" se vazio)`}
                isFocused={true}
                cursorColor={theme.colors.primary}
              />
            </Box>
          ) : (
            <Text
              color={currentName ? theme.colors.text : theme.colors.muted}
              wrap="truncate-end"
            >
              {currentName || `(auto: ${autoNamePlaceholder})`}
            </Text>
          )}
        </Box>
        <Text color={theme.colors.muted}>
          Identificador amigável para exibição nos logs e relatórios.
        </Text>
      </Box>

      {/* Botão [ Salvar Hook ] */}
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
            [ Salvar Hook ]
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
        <Text color={theme.colors.muted}>[Space ou ←/→] Alternar tipo</Text>
        <Text color={theme.colors.muted}>[Enter] Salvar</Text>
        <Text color={theme.colors.muted}>[Esc] Cancelar</Text>
      </Box>
    </Box>
  );
};
