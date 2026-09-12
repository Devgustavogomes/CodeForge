import { Box, Text, useInput } from "ink";
import { theme } from "../../../theme.js";

export interface WelcomeStepProps {
  onStart: () => void;
  onExit: () => void;
  isActive?: boolean;
}

/** Logo CODEFORGE ANSI Shadow com degradê vertical entre accent e primary. */
const logoArt = [
  {
    color: theme.colors.accent,
    text: "   ██████╗ ██████╗ ██████╗ ███████╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗",
  },
  {
    color: theme.colors.accent,
    text: "  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝",
  },
  {
    color: theme.colors.primary,
    text: "  ██║     ██║   ██║██║  ██║█████╗  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ",
  },
  {
    color: theme.colors.primary,
    text: "  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ",
  },
  {
    color: theme.colors.primary,
    text: "  ╚██████╗╚██████╔╝██████╔╝███████╗██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗",
  },
  {
    color: theme.colors.primary,
    text: "   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
  },
] as const;

/** Etapas do pipeline de desenvolvimento autônomo. */
const pipelineSteps = [
  { label: "Spec", isHighlight: false },
  { label: "Plan", isHighlight: false },
  { label: "DAG", isHighlight: false },
  { label: "Parallel Execution", isHighlight: false },
  { label: "Verify", isHighlight: false },
  { label: "Docs", isHighlight: false },
  { label: "Ship", isHighlight: true },
];

/** Primeira tela do onboarding do CodeForge. */
export function WelcomeStep({
  onStart,
  onExit,
  isActive = true,
}: WelcomeStepProps) {
  useInput(
    (input, key) => {
      if (key.return || input === "\r" || input === "\n") {
        onStart();
        return;
      }

      if (key.escape || input.toLowerCase() === "q") {
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
      width="100%"
      height="100%"
      paddingX={2}
    >
      {/* Logo CodeForge */}
      <Box flexDirection="column" alignItems="flex-start">
        {logoArt.map((row, index) => (
          <Text key={index} color={row.color}>
            {row.text}
          </Text>
        ))}
      </Box>

      {/* Linha divisora sutil superior */}
      <Box marginTop={1}>
        <Text color={theme.colors.borderSubtle}>
          ─────────────────────────────────────────────────────────────────────────────
        </Text>
      </Box>

      {/* Tagline */}
      <Box marginTop={1}>
        <Text bold color={theme.colors.text}>
          Deterministic workflows for AI coding agents.
        </Text>
      </Box>

      {/* Pipeline de execução */}
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
              <Text color={theme.colors.muted}>→</Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Linha divisora sutil inferior */}
      <Box marginTop={1}>
        <Text color={theme.colors.borderSubtle}>
          ─────────────────────────────────────────────────────────────────────────────
        </Text>
      </Box>

      {/* Descrição resumida */}
      <Box marginTop={1} maxWidth={96} justifyContent="center">
        <Text color={theme.colors.muted} wrap="wrap">
          Transforme especificações e tarefas em código funcional utilizando
          agentes autônomos de IA dentro de um ambiente seguro e controlado.
        </Text>
      </Box>

      {/* Ações de navegação */}
      <Box marginTop={1} gap={1} justifyContent="center" flexWrap="wrap">
        <Text bold color={theme.colors.success}>
          [Enter] Começar Configuração
        </Text>
        <Text color={theme.colors.borderSubtle}>|</Text>
        <Text color={theme.colors.error}>[q/Esc] Sair</Text>
      </Box>
    </Box>
  );
}

export default WelcomeStep;

