import { useInput } from 'ink';
import { DashboardPanel } from './useRunDashboard.js';

/** Atalhos globais do dashboard Run, desacoplados de contextos. */
export interface UseRunHotkeysProps {
  isInteractive?: boolean;
  isModalOpen?: boolean;
  isTextInputActive?: boolean;
  focusedPanel: DashboardPanel;
  selectedTaskId: string | null;
  selectedTaskStatus: string | null;
  effectiveStatus: string;
  allTasksCompleted?: boolean;
  onTogglePanel: () => void;
  onStartRun: () => void;
  onStartReview?: () => void;
  onRetryTask: () => void;
  onRetryAllFailed: () => void;
  onCompleteTask: () => void;
  onResetTask: () => void;
  onResetAllTasks: () => void;
  onSelectIntent?: () => void;
  onFocusLogs: () => void;
  onFocusTasks: () => void;
}

export function useRunHotkeys({
  isInteractive = true,
  isModalOpen = false,
  isTextInputActive = false,
  focusedPanel,
  selectedTaskId,
  selectedTaskStatus,
  effectiveStatus,
  allTasksCompleted = false,
  onTogglePanel,
  onStartRun,
  onStartReview,
  onRetryTask,
  onRetryAllFailed,
  onCompleteTask,
  onResetTask,
  onResetAllTasks,
  onSelectIntent,
  onFocusLogs,
  onFocusTasks,
}: UseRunHotkeysProps): void {
  const handleSelectIntent = onSelectIntent;

  useInput(
    (input, key) => {
      if (!isInteractive || isModalOpen || isTextInputActive) return;

      if (key.tab || input === '\t') {
        onTogglePanel();
        return;
      }

      if (key.escape && focusedPanel === 'logs') {
        onFocusTasks();
        return;
      }

      // Navegação, filtros e scrolling pertencem aos componentes filhos.
      if (focusedPanel !== 'tasks') return;

      if (input === 's') {
        handleSelectIntent?.();
        return;
      }

      if (key.return || input === '\r' || input === '\n') {
        if (effectiveStatus !== 'running' && effectiveStatus !== 'reviewing') onStartRun();
        else if (effectiveStatus === 'running') onFocusLogs();
        return;
      }

      if (input === ' ') {
        if (effectiveStatus !== 'running' && effectiveStatus !== 'reviewing') onStartRun();
        return;
      }

      if (input === 'v') {
        if (allTasksCompleted && effectiveStatus !== 'running' && effectiveStatus !== 'reviewing') {
          onStartReview?.();
        }
        return;
      }

      if (input === 'X') {
        onResetAllTasks();
        return;
      }
      if (input === 'r') {
        if (selectedTaskId && selectedTaskStatus === 'failed') onRetryTask();
        return;
      }
      if (input === 'R') {
        onRetryAllFailed();
        return;
      }
      if (input === 'c' && selectedTaskId) {
        onCompleteTask();
        return;
      }
      if (input === 'x' && selectedTaskId) onResetTask();
    },
    { isActive: isInteractive && !isModalOpen && !isTextInputActive },
  );
}

export default useRunHotkeys;
