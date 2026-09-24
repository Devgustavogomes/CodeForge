import React, { memo } from 'react';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { useRunDashboard, DashboardPanel } from './hooks/useRunDashboard.js';
import { useRunHotkeys } from './hooks/useRunHotkeys.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useExecution } from '../../context/ExecutionContext.js';
import { IntentPicker } from './components/IntentPicker.js';
import {
  DashboardMetricsPanel,
  DashboardMetricsPanelProps,
  renderProgressBar,
} from './components/DashboardMetricsPanel.js';
import { RunLayoutMinimal } from './components/RunLayoutMinimal.js';
import { RunLayoutCompact } from './components/RunLayoutCompact.js';
import { RunLayoutWide } from './components/RunLayoutWide.js';
import {
  ActiveHookState,
  HookHistoryItem,
} from '../../context/ExecutionContext.js';
import { RunActionBar } from './components/RunActionBar.js';
import { HooksPanel } from './components/HooksPanel.js';

export type { DashboardPanel, DashboardMetricsPanelProps };
export { renderProgressBar, DashboardMetricsPanel, IntentPicker, HooksPanel };

export interface RunDashboardProps {
  isInteractive?: boolean;
  activeHook?: ActiveHookState | null;
  hookHistory?: HookHistoryItem[];
  hasConfiguredHooks?: boolean;
}

const RunDashboardContent: React.FC<RunDashboardProps> = memo(({
  isInteractive = true,
  activeHook: propActiveHook,
  hookHistory: propHookHistory,
  hasConfiguredHooks: propHasConfiguredHooks,
}) => {
  const navigation = useNavigation();
  const terminalDims = useTerminalDimensions();
  const dashboardState = useRunDashboard();
  const {
    tasks,
    selectedTaskId,
    selectedTask,
    focusedPanel,
    actionFeedback,
    logs,
    taskLogs,
    completedCount,
    failedCount,
    runningCount,
    pendingCount,
    totalCount,
    effectiveIntentName,
    effectiveStatus,
    derivedStartedAt,
    derivedCompletedAt,
    reviewStartedAt,
    reviewResult,
    reviewError,
  } = dashboardState;

  const activeHook = propActiveHook !== undefined ? propActiveHook : dashboardState.activeHook;
  const hookHistory = propHookHistory !== undefined ? propHookHistory : dashboardState.hookHistory;
  const hasConfiguredHooks =
    propHasConfiguredHooks !== undefined
      ? propHasConfiguredHooks
      : dashboardState.hasConfiguredHooks;
  const showReviewLogs = effectiveStatus !== 'reviewing' && effectiveStatus !== 'running'
    && Boolean(logs.review?.length) && Boolean(reviewResult || reviewError);
  const visibleLogTaskId = showReviewLogs ? 'review' : selectedTaskId;
  const visibleTaskLogs = showReviewLogs ? (logs.review ?? []) : taskLogs;

  useRunHotkeys({
    isInteractive,
    isModalOpen: Boolean(navigation.modal),
    isTextInputActive: navigation.isTextInputActive,
    focusedPanel,
    selectedTaskId,
    selectedTaskStatus: dashboardState.selectedTaskStatus,
    effectiveStatus,
    allTasksCompleted: tasks.length > 0 && completedCount === tasks.length,
    onTogglePanel: dashboardState.onTogglePanel,
    onStartRun: dashboardState.onStartRun,
    onStartReview: dashboardState.onStartReview,
    onRetryTask: dashboardState.onRetryTask,
    onRetryAllFailed: dashboardState.onRetryAllFailed,
    onCompleteTask: dashboardState.onCompleteTask,
    onResetTask: dashboardState.onResetTask,
    onResetAllTasks: dashboardState.onResetAllTasks,
    onSelectIntent: dashboardState.onSelectIntent,
    onFocusLogs: dashboardState.onFocusLogs,
    onFocusTasks: dashboardState.onFocusTasks,
  });

  if (terminalDims.breakpoint === 'minimal') {
    return (
      <RunLayoutMinimal
        completedCount={completedCount}
        totalCount={totalCount}
        failedCount={failedCount}
        runningCount={runningCount}
        effectiveStatus={effectiveStatus}
        terminalColumns={terminalDims.columns}
        terminalRows={terminalDims.rows}
      />
    );
  }

  const topMetricsPanel = (
    <DashboardMetricsPanel
      intentName={effectiveIntentName}
      tasks={tasks}
      schedulerStatus={effectiveStatus}
      startedAt={derivedStartedAt}
      completedAt={derivedCompletedAt}
      reviewStartedAt={reviewStartedAt}
      reviewResult={reviewResult}
      reviewError={reviewError}
    />
  );

  const actionBar = (
    <RunActionBar
      focusedPanel={focusedPanel}
      selectedTaskStatus={selectedTask?.status ?? null}
      effectiveStatus={effectiveStatus}
      hasFailedTasks={failedCount > 0}
      hasPendingTasks={pendingCount > 0}
      actionFeedback={
        actionFeedback ? { type: 'info', message: actionFeedback } : null
      }
    />
  );

  if (terminalDims.breakpoint === 'compact') {
    return (
      <RunLayoutCompact
        topMetricsPanel={topMetricsPanel}
        actionBar={actionBar}
        focusedPanel={focusedPanel}
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        logTaskId={visibleLogTaskId}
        selectedTask={selectedTask}
        terminalRows={terminalDims.rows}
        logs={logs}
        taskLogs={visibleTaskLogs}
        onCompleteTask={dashboardState.onCompleteTask}
        activeHook={activeHook}
        hookHistory={hookHistory}
        hasConfiguredHooks={hasConfiguredHooks}
      />
    );
  }

  return (
    <RunLayoutWide
      topMetricsPanel={topMetricsPanel}
      actionBar={actionBar}
      focusedPanel={focusedPanel}
      tasks={tasks}
      selectedTaskId={selectedTaskId}
      logTaskId={visibleLogTaskId}
      selectedTask={selectedTask}
      terminalRows={terminalDims.rows}
      logs={logs}
      taskLogs={visibleTaskLogs}
      onCompleteTask={dashboardState.onCompleteTask}
      activeHook={activeHook}
      hookHistory={hookHistory}
      hasConfiguredHooks={hasConfiguredHooks}
    />
  );
});

RunDashboardContent.displayName = 'RunDashboardContent';

export const RunDashboard: React.FC<RunDashboardProps> = memo((props) => {
  const exec = useExecution();
  const activeIntent = exec.activeIntent;

  if (!activeIntent || exec.tasks.length === 0) {
    return <IntentPicker isInteractive={props.isInteractive} />;
  }

  return <RunDashboardContent key={activeIntent} {...props} />;
});

RunDashboard.displayName = 'RunDashboard';
export default RunDashboard;
