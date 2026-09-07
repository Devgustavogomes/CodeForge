import React, { memo } from 'react';
import { useTerminalDimensions, Breakpoint } from '../../hooks/useTerminalDimensions.js';
import { TaskItem, ExecutionStatus } from '../../context/ExecutionContext.js';
import { useRunDashboard, DashboardPanel } from './hooks/useRunDashboard.js';
import { useRunHotkeys } from './hooks/useRunHotkeys.js';
import { SpecPicker } from './components/SpecPicker.js';
import {
  DashboardMetricsPanel,
  DashboardMetricsPanelProps,
  renderProgressBar,
} from './components/DashboardMetricsPanel.js';
import { RunLayoutMinimal } from './components/RunLayoutMinimal.js';
import { RunLayoutCompact } from './components/RunLayoutCompact.js';
import { RunLayoutWide } from './components/RunLayoutWide.js';

export type { DashboardPanel, DashboardMetricsPanelProps };
export { renderProgressBar, DashboardMetricsPanel, SpecPicker };

export interface RunDashboardProps {
  breakpoint?: Breakpoint;
  tasks?: TaskItem[];
  selectedTaskId?: string | null;
  selectedTask?: TaskItem | null;
  onStartRun?: (specName?: string) => void;
  onRetryTask?: (taskId: string) => void;
  onRetryAllFailed?: () => void;
  onCompleteTask?: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  onResetAllTasks?: () => void;
  isInteractive?: boolean;
  defaultFocusedPanel?: DashboardPanel;
  specName?: string;
  schedulerStatus?: ExecutionStatus | string;
  startedAt?: string;
  completedAt?: string;
  onSelectSpec?: () => void;
}

export const RunDashboard: React.FC<RunDashboardProps> = memo((props) => {
  const {
    breakpoint: propBreakpoint,
    isInteractive = true,
    onSelectSpec,
  } = props;
  const terminalDims = useTerminalDimensions();
  const effectiveBreakpoint = propBreakpoint ?? terminalDims.breakpoint;

  const dashboardState = useRunDashboard(props);
  const {
    tasks,
    selectedTaskId,
    selectedTask,
    focusedPanel,
    completedCount,
    failedCount,
    runningCount,
    totalCount,
    effectiveSpecName,
    effectiveStatus,
    derivedStartedAt,
    derivedCompletedAt,
  } = dashboardState;

  useRunHotkeys({
    isInteractive: isInteractive && tasks.length > 0,
    ...dashboardState,
  });

  if (tasks.length === 0) {
    return <SpecPicker isInteractive={isInteractive} onSelectSpec={onSelectSpec} />;
  }

  if (effectiveBreakpoint === 'minimal') {
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
      specName={effectiveSpecName}
      tasks={tasks}
      schedulerStatus={effectiveStatus}
      startedAt={derivedStartedAt}
      completedAt={derivedCompletedAt}
    />
  );

  if (effectiveBreakpoint === 'compact') {
    return (
      <RunLayoutCompact
        topMetricsPanel={topMetricsPanel}
        focusedPanel={focusedPanel}
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        selectedTask={selectedTask}
        terminalRows={terminalDims.rows}
      />
    );
  }

  return (
    <RunLayoutWide
      topMetricsPanel={topMetricsPanel}
      focusedPanel={focusedPanel}
      tasks={tasks}
      selectedTaskId={selectedTaskId}
      selectedTask={selectedTask}
      terminalRows={terminalDims.rows}
    />
  );
});

RunDashboard.displayName = 'RunDashboard';
export default RunDashboard;
