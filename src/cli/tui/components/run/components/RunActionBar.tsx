import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { ExecutionStatus } from '../../../context/ExecutionContext.js';
import { DashboardPanel } from '../hooks/useRunDashboard.js';

export interface RunActionFeedback {
  type: 'info' | 'success' | 'error';
  message: string;
}

export interface RunActionBarProps {
  focusedPanel: DashboardPanel;
  selectedTaskStatus: string | null;
  effectiveStatus: ExecutionStatus | string;
  hasFailedTasks: boolean;
  hasPendingTasks: boolean;
  actionFeedback?: RunActionFeedback | string | null;
}

const feedbackColor = (type?: RunActionFeedback['type']): 'yellow' | 'green' | 'red' => {
  if (type === 'success') return 'green';
  if (type === 'error') return 'red';
  return 'yellow';
};

/** Barra puramente visual das acoes contextuais da tela Run. */
export const RunActionBar: React.FC<RunActionBarProps> = memo(({
  focusedPanel,
  selectedTaskStatus,
  effectiveStatus,
  hasFailedTasks,
  hasPendingTasks,
  actionFeedback = null,
}) => {
  const feedbackMessage = typeof actionFeedback === 'string' ? actionFeedback : actionFeedback?.message;
  const feedbackType = typeof actionFeedback === 'string' ? 'info' : actionFeedback?.type;

  if (focusedPanel === 'logs') {
    const logActions = '[Esc] Back to Tasks  |  [\u2191/\u2193] Scroll  |  [w] Wrap  |  [g] Top  |  [G] Bottom';
    return (
      <Box flexDirection="column" width="100%" flexShrink={0}>
        <Text dimColor wrap="truncate-end">{logActions}</Text>
        {feedbackMessage && (
          <Text color={feedbackColor(feedbackType)} bold wrap="truncate-end">
            {'\u203a'} {feedbackMessage}
          </Text>
        )}
      </Box>
    );
  }

  const navigationActions = ['[Tab] Logs', '[s] Switch Spec', '[f] Filter'];
  const taskActions: string[] = [];

  if (effectiveStatus !== 'running' && hasPendingTasks) {
    taskActions.push('[Enter] Start Run');
  }
  if (selectedTaskStatus === 'failed') {
    taskActions.push('[r] Retry');
    if (hasFailedTasks) taskActions.push('[R] Retry All Failed');
  } else if (selectedTaskStatus === 'pending' || selectedTaskStatus === 'completed') {
    taskActions.push('[x] Reset');
    taskActions.push('[c] Complete');
  }
  taskActions.push('[X] Reset All & Run');

  return (
    <Box flexDirection="column" width="100%" flexShrink={0}>
      <Text dimColor wrap="truncate-end">{navigationActions.join('  |  ')}</Text>
      <Text dimColor wrap="truncate-end">{taskActions.join('  |  ')}</Text>
      {feedbackMessage && (
        <Text color={feedbackColor(feedbackType)} bold wrap="truncate-end">
          {'\u203a'} {feedbackMessage}
        </Text>
      )}
    </Box>
  );
});

RunActionBar.displayName = 'RunActionBar';
export default RunActionBar;
