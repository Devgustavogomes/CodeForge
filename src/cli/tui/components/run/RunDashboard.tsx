import React, { memo } from 'react';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { useRunDashboard, DashboardPanel } from './hooks/useRunDashboard.js';
import { useRunHotkeys } from './hooks/useRunHotkeys.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { IntentPicker, } from './components/IntentPicker.js';
import {
  DashboardMetricsPanel,
  DashboardMetricsPanelProps,
  renderProgressBar,
} from './components/DashboardMetricsPanel.js';
import { RunLayoutMinimal } from './components/RunLayoutMinimal.js';
import { RunLayoutCompact } from './components/RunLayoutCompact.js';
import { RunLayoutWide } from './components/RunLayoutWide.js';
import { RunActionBar } from './components/RunActionBar.js';

export type { DashboardPanel, DashboardMetricsPanelProps };
export { renderProgressBar, DashboardMetricsPanel, IntentPicker };

export interface RunDashboardProps {
  isInteractive?: boolean;
}

export const RunDashboard: React.FC<RunDashboardProps> = memo(({ isInteractive = true }) => {
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
  } = dashboardState;

  useRunHotkeys({
    isInteractive: isInteractive && tasks.length > 0,
    isModalOpen: Boolean(navigation.modal),
    isTextInputActive: navigation.isTextInputActive,
    focusedPanel,
    selectedTaskId,
    selectedTaskStatus: dashboardState.selectedTaskStatus,
    effectiveStatus,
    onTogglePanel: dashboardState.onTogglePanel,
    onStartRun: dashboardState.onStartRun,
    onRetryTask: dashboardState.onRetryTask,
    onRetryAllFailed: dashboardState.onRetryAllFailed,
    onCompleteTask: dashboardState.onCompleteTask,
    onResetTask: dashboardState.onResetTask,
    onResetAllTasks: dashboardState.onResetAllTasks,
    onSelectIntent: dashboardState.onSelectIntent,
    onFocusLogs: dashboardState.onFocusLogs,
    onFocusTasks: dashboardState.onFocusTasks,
  });

  if (tasks.length === 0) {
    return <IntentPicker isInteractive={isInteractive} />;
  }

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
        selectedTask={selectedTask}
        terminalRows={terminalDims.rows}
        logs={logs}
        taskLogs={taskLogs}
        onCompleteTask={dashboardState.onCompleteTask}
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
      selectedTask={selectedTask}
      terminalRows={terminalDims.rows}
      logs={logs}
      taskLogs={taskLogs}
      onCompleteTask={dashboardState.onCompleteTask}
    />
  );
});

RunDashboard.displayName = 'RunDashboard';
export default RunDashboard;
