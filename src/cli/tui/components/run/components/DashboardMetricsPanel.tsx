import React, { useMemo, memo } from "react";
import { Box, Text } from "ink";
import {
  TaskItem,
  ExecutionStatus,
} from "../../../context/ExecutionContext.js";
import { TimerView } from "../../common/TimerView.js";
import { Spinner } from "../../common/Spinner.js";
import { renderProgressBar } from "../../../theme.js";

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
            <Text bold color="green">
              ✓ Execution Completed Successfully
            </Text>
            <Text color="green" bold>
              Total Time:{" "}
              <TimerView
                startTime={startedAt}
                isRunning={false}
                endTime={completedAt}
              />
            </Text>
          </Box>

          <Box gap={2} marginY={0}>
            <Text color="green" bold>
              ✓ {completedCount}/{totalCount} tasks completed
            </Text>
            <Text color="gray">│</Text>
            <Text color="green">{failedCount} failures</Text>
          </Box>

          <Box gap={2} marginTop={0} flexWrap="wrap">
            <Text bold color="cyan">
              [s] Choose another spec
            </Text>
            <Text color="gray">│</Text>
            <Text bold color="yellow">
              [X] Reset all & Re-run
            </Text>
            <Text color="gray">│</Text>
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
            <Text bold color="red">
              ✗ Execution Finished with Failures
            </Text>
            <Text color="red" bold>
              Total Time:{" "}
              <TimerView
                startTime={startedAt}
                isRunning={false}
                endTime={completedAt}
              />
            </Text>
          </Box>

          <Box gap={2} marginY={0} flexWrap="wrap">
            <Text color="green" bold>
              ✓ {completedCount} completed
            </Text>
            <Text color="gray">│</Text>
            <Text color="red" bold>
              ✗ {failedCount} failure{failedCount === 1 ? "" : "s"}
            </Text>
            <Text color="gray">│</Text>
            <Text dimColor>{pendingCount} remaining</Text>
          </Box>

          <Box gap={2} marginTop={0} flexWrap="wrap">
            <Text bold color="red">
              [R] Retry all failed
            </Text>
            <Text color="gray">│</Text>
            <Text bold color="green">
              [Enter] Resume
            </Text>
            <Text color="gray">│</Text>
            <Text bold color="yellow">
              [r] Retry selected
            </Text>
            <Text color="gray">│</Text>
            <Text dimColor>[s] Specs</Text>
          </Box>
        </Box>
      );
    }

    // Live Metrics Panel during run / idle
    const progressBar = renderProgressBar(completedCount, totalCount, 18);

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
            <Text bold color="cyan">
              {isRunning ? "Running" : "Spec"} [{specName}]
            </Text>
          </Box>
          <Box gap={1}>
            <Text color="cyan">
              Time:{" "}
              <TimerView
                startTime={startedAt}
                isRunning={isRunning}
                endTime={completedAt}
              />
            </Text>
            {isRunning && <Spinner color="cyan" />}
          </Box>
        </Box>

        <Box gap={2} marginY={0} flexWrap="wrap">
          <Box gap={1}>
            {isRunning ? (
              <Spinner color="yellow" />
            ) : (
              <Text color="yellow">-</Text>
            )}
            <Text color="yellow" bold>
              Parallel: {runningCount}
            </Text>
          </Box>
          <Text color="gray">│</Text>
          <Text color="green" bold>
            ✓ Completed: {completedCount}
          </Text>
          <Text color="gray">│</Text>
          <Text color="red" bold>
            ✗ Failed: {failedCount}
          </Text>
          <Text color="gray">│</Text>
          <Text dimColor>Remaining: {pendingCount}</Text>
        </Box>

        <Box marginTop={0} justifyContent="space-between" width="100%">
          <Text bold color="cyan">
            {progressBar}
          </Text>
          {!isRunning && pendingCount > 0 && (
            <Text bold color="green">
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
