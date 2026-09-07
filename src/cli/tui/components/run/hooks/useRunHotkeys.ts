import { useInput } from 'ink';
import { useNavigation } from '../../../context/NavigationContext.js';
import { TaskItem, ExecutionStatus } from '../../../context/ExecutionContext.js';
import { DashboardPanel } from './useRunDashboard.js';

export interface UseRunHotkeysOptions {
  isInteractive?: boolean;
  focusedPanel: DashboardPanel;
  setFocusedPanel: (panel: DashboardPanel | ((prev: DashboardPanel) => DashboardPanel)) => void;
  effectiveStatus: ExecutionStatus | string;
  effectiveSpecName: string;
  tasks: TaskItem[];
  selectedTaskId?: string | null;
  startRun?: (specName?: string) => void | Promise<void>;
  retryTask?: (taskId: string) => void | Promise<void>;
  retryAllFailed?: () => void | Promise<void>;
  completeTask?: (taskId: string) => void | Promise<void>;
  resetTask?: (taskId: string) => void | Promise<void>;
  resetAllTasks?: () => void | Promise<void>;
  onSelectSpec?: () => void;
  setActiveSpec?: (specName: string | null) => void;
}

export function useRunHotkeys({
  isInteractive = true,
  focusedPanel,
  setFocusedPanel,
  effectiveStatus,
  effectiveSpecName,
  tasks,
  selectedTaskId,
  startRun,
  retryTask,
  retryAllFailed,
  completeTask,
  resetTask,
  resetAllTasks,
  onSelectSpec,
  setActiveSpec,
}: UseRunHotkeysOptions) {
  const nav = useNavigation();

  useInput(
    (input, key) => {
      // Toggle focus between TaskList and LogStreamView on Tab
      if (key.tab || input === '\t') {
        setFocusedPanel((prev) => (prev === 'tasks' ? 'logs' : 'tasks'));
        return;
      }

      // Start or resume execution with Enter or Space when idle/not running
      if (
        (key.return || input === ' ') &&
        effectiveStatus !== 'running' &&
        focusedPanel === 'tasks'
      ) {
        if (
          effectiveStatus === 'idle' ||
          effectiveStatus === 'failed' ||
          effectiveStatus === 'deadlock' ||
          tasks.some((t) => t.status === 'pending')
        ) {
          if (startRun) {
            void startRun(effectiveSpecName);
            return;
          }
        }
      }

      // If in TaskList, pressing Enter switches focus to Logs panel
      if (key.return && focusedPanel === 'tasks') {
        setFocusedPanel('logs');
        return;
      }

      // If in Logs, pressing Escape returns focus to TaskList
      if (key.escape && focusedPanel === 'logs') {
        setFocusedPanel('tasks');
        return;
      }

      // Switch Spec with 's' if user wants to pick another spec
      if (input === 's') {
        onSelectSpec?.();
        setActiveSpec?.(null);
        return;
      }

      // Reset all tasks with 'X'
      if (input === 'X') {
        if (resetAllTasks) {
          void resetAllTasks();
        }
        return;
      }

      // Retry selected task
      if (input === 'r') {
        if (selectedTaskId && retryTask) {
          void retryTask(selectedTaskId);
        }
        return;
      }

      // Retry all failed tasks
      if (input === 'R') {
        if (retryAllFailed) {
          void retryAllFailed();
        }
        return;
      }

      // Complete selected task
      if (input === 'c') {
        if (selectedTaskId && completeTask) {
          void completeTask(selectedTaskId);
        }
        return;
      }

      // Reset selected task
      if (input === 'x') {
        if (selectedTaskId && resetTask) {
          void resetTask(selectedTaskId);
        }
        return;
      }
    },
    { isActive: isInteractive && !nav.isTextInputActive && !nav.modal },
  );
}

export default useRunHotkeys;
