import React, { useMemo, memo } from "react";
import { Box, Text } from "ink";
import {
  TaskItem,
  ExecutionStatus,
} from "../../../context/ExecutionContext.js";
import { TimerView } from "../../common/TimerView.js";
import { Spinner } from "../../common/Spinner.js";
import { renderProgressBar, theme } from "../../../theme.js";

export { renderProgressBar };

export interface DashboardMetricsPanelProps {
  specName: string;
  tasks: TaskItem[];
  schedulerStatus: ExecutionStatus | string;
  startedAt?: string;
  completedAt?: string;
}

export const DashboardMetricsPanel: React.FC<DashboardMetricsPanelProps> = memo(
  ({ specName, tasks, schedulerStatus, startedAt, completedAt }) => {
    const completedCount = useMemo(
      () => tasks.filter((t) => t.status === "completed").length,
      [tasks],
    );
    const failedCount = useMemo(
      () => tasks.filter((t) => t.status === "failed").length,
      [tasks],
    );
    const runningCount = useMemo(
      () => tasks.filter((t) => t.status === "running").length,
      [tasks],
    );
    const pendingCount = useMemo(
      () => tasks.filter((t) => t.status === "pending").length,
      [tasks],
    );
    const totalCount = tasks.length;
    const isRunning = schedulerStatus === "running" || runningCount > 0;

    // Success Banner when completed
    if (schedulerStatus === "completed") {
      return (
        <Box
          flexDirection="column"
          paddingX={1}
          paddingY={0}
          marginBottom={1}
          width="100%"
        >
          <Box justifyContent="space-between" width="100%">
            <Text bold color={theme.colors.success}>
              ✓ Execution Completed Successfully
            </Text>
            <Text color={theme.colors.success} bold>
              Total Time:{" "}
              <TimerView
                startTime={startedAt}
                isRunning={false}
                endTime={completedAt}
              />
            </Text>
          </Box>

          <Box gap={2} marginY={0}>
            <Text color={theme.colors.success} bold>
              ✓ {completedCount}/{totalCount} tasks completed
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text color={theme.colors.success}>{failedCount} failures</Text>
          </Box>

          <Box gap={2} marginTop={0} flexWrap="wrap">
            <Text bold color={theme.colors.primary}>
              [s] Choose another spec
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text bold color={theme.colors.warning}>
              [X] Reset all & Re-run
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text dimColor>[Tab] Inspect logs</Text>
          </Box>
        </Box>
      );
    }

    // Failure Banner when failed or deadlock
    if (schedulerStatus === "failed" || schedulerStatus === "deadlock") {
      return (
        <Box
          flexDirection="column"
          paddingX={1}
          paddingY={0}
          marginBottom={1}
          width="100%"
        >
          <Box justifyContent="space-between" width="100%">
            <Text bold color={theme.colors.error}>
              ✗ Execution Finished with Failures
            </Text>
            <Text color={theme.colors.error} bold>
              Total Time:{" "}
              <TimerView
                startTime={startedAt}
                isRunning={false}
                endTime={completedAt}
              />
            </Text>
          </Box>

          <Box gap={2} marginY={0} flexWrap="wrap">
            <Text color={theme.colors.success} bold>
              ✓ {completedCount} completed
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text color={theme.colors.error} bold>
              ✗ {failedCount} failure{failedCount === 1 ? "" : "s"}
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text dimColor>{pendingCount} remaining</Text>
          </Box>

          <Box gap={2} marginTop={0} flexWrap="wrap">
            <Text bold color={theme.colors.error}>
              [R] Retry all failed
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text bold color={theme.colors.success}>
              [Enter] Resume
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text bold color={theme.colors.warning}>
              [r] Retry selected
            </Text>
            <Text color={theme.colors.borderSubtle}>│</Text>
            <Text dimColor>[s] Specs</Text>
          </Box>
        </Box>
      );
    }

    // Live Metrics Panel during run / idle
    const progressBar = renderProgressBar(completedCount, totalCount, 18);
    const progressBarCloseIndex = progressBar.indexOf("]");
    const progressBarBody = progressBar.slice(1, progressBarCloseIndex);
    const firstEmptyIndex = progressBarBody.indexOf(theme.symbols.barEmpty);
    const progressBarFilled =
      firstEmptyIndex === -1 ? progressBarBody : progressBarBody.slice(0, firstEmptyIndex);
    const progressBarEmpty =
      firstEmptyIndex === -1 ? "" : progressBarBody.slice(firstEmptyIndex);
    const progressBarLabel = progressBar.slice(progressBarCloseIndex + 1);

    return (
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        marginBottom={0}
        width="100%"
      >
        <Box justifyContent="space-between" width="100%">
          <Box gap={1}>
            <Text bold color={theme.colors.primary}>
              {isRunning ? "Running" : "Spec"} [{specName}]
            </Text>
          </Box>
          <Box gap={1}>
            <Text color={theme.colors.primary}>
              Time:{" "}
              <TimerView
                startTime={startedAt}
                isRunning={isRunning}
                endTime={completedAt}
              />
            </Text>
            {isRunning && <Spinner color={theme.colors.primary} />}
          </Box>
        </Box>

        <Box gap={2} marginY={0} flexWrap="wrap">
          <Box gap={1}>
            {isRunning ? (
              <Spinner color={theme.colors.warning} />
            ) : (
              <Text color={theme.colors.warning}>-</Text>
            )}
            <Text color={theme.colors.warning} bold>
              Parallel: {runningCount}
            </Text>
          </Box>
          <Text color={theme.colors.borderSubtle}>│</Text>
          <Text color={theme.colors.success} bold>
            ✓ Completed: {completedCount}
          </Text>
          <Text color={theme.colors.borderSubtle}>│</Text>
          <Text color={theme.colors.error} bold>
            ✗ Failed: {failedCount}
          </Text>
          <Text color={theme.colors.borderSubtle}>│</Text>
          <Text dimColor>Remaining: {pendingCount}</Text>
        </Box>

        <Box marginTop={0} justifyContent="space-between" width="100%">
          <Text bold color={theme.colors.primary}>
            [
            <Text color={theme.colors.primary}>{progressBarFilled}</Text>
            <Text color={theme.colors.bgEmpty}>{progressBarEmpty}</Text>
            ]{progressBarLabel}
          </Text>
          {!isRunning && pendingCount > 0 && (
            <Text bold color={theme.colors.success}>
              [Enter / Space] Start Run
            </Text>
          )}
        </Box>
      </Box>
    );
  },
);

DashboardMetricsPanel.displayName = "DashboardMetricsPanel";
export default DashboardMetricsPanel;
