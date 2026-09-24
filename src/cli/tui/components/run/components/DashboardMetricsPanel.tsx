import React, { useMemo, memo } from "react";
import { Box, Text } from "ink";
import {
  TaskItem,
  ExecutionStatus,
} from "../../../context/ExecutionContext.js";
import { TimerView } from "../../common/TimerView.js";
import { Spinner } from "../../common/Spinner.js";
import { renderProgressBar, theme } from "../../../theme.js";
import { ReviewResultMetadata } from '../../../../../domain/hook.js';

export { renderProgressBar };

function reviewErrorSummary(error: string): string {
  const escape = String.fromCharCode(27);
  const firstLine = error.replace(new RegExp(`${escape}\\[[0-9;]*[a-zA-Z]`, 'g'), '').split(/\r?\n/)[0].trim();
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

export interface DashboardMetricsPanelProps {
  intentName?: string;  tasks: TaskItem[];
  schedulerStatus: ExecutionStatus | string;
  startedAt?: string;
  completedAt?: string;
  reviewStartedAt?: string;
  reviewResult?: ReviewResultMetadata;
  reviewError?: string;
}

export const DashboardMetricsPanel: React.FC<DashboardMetricsPanelProps> = memo(
  ({ intentName,  tasks, schedulerStatus, startedAt, completedAt, reviewStartedAt, reviewResult, reviewError }) => {
    const displayName = intentName ?? "";

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

    if (schedulerStatus === 'reviewing') {
      return (
        <Box flexDirection="column" paddingX={1} marginBottom={1} width="100%">
          <Box justifyContent="space-between" width="100%" overflow="hidden">
            <Box gap={1} flexShrink={1} overflow="hidden"><Spinner color={theme.colors.primary} /><Text bold color={theme.colors.primary} wrap="truncate-end">AI Review in progress</Text></Box>
            <Text color={theme.colors.primary} bold>Elapsed: <TimerView startTime={reviewStartedAt ?? startedAt} isRunning /></Text>
          </Box>
          <Text dimColor>Completed tasks are preserved while the reviewer checks this intent.</Text>
        </Box>
      );
    }

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

          <Text color={theme.colors.primary} wrap="truncate-end">[s] Intents  [X] Reset &amp; Run  [Tab] Logs  [v] Review</Text>
          {reviewResult?.outcome === 'approved' && <Text color={theme.colors.success}>AI Review approved the implementation. No new tasks created.</Text>}
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

          <Text color={theme.colors.text} wrap="truncate-end">[R] Retry all  [Enter] Resume  [r] Retry selected  [s] Intents</Text>
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
        <Box justifyContent="space-between" width="100%" overflow="hidden">
          <Box gap={1} flexShrink={1} overflow="hidden">
            <Text bold color={theme.colors.primary} wrap="truncate-end">
              {isRunning ? "Running" : "Intent"} [{displayName}]
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

        <Box marginY={0} width="100%" overflow="hidden">
          <Text wrap="truncate-end" color={theme.colors.text}>
            Parallel: {runningCount}  |  Completed: {completedCount}  |  Failed: {failedCount}  |  Remaining: {pendingCount}
          </Text>
        </Box>

        {reviewResult?.outcome === 'tasks_created' && (
          <Text color={theme.colors.warning} bold wrap="truncate-end">AI Review created {reviewResult.newTasksCount} new task{reviewResult.newTasksCount === 1 ? '' : 's'}. Press [Enter] to run.</Text>
        )}
        {reviewError && (
          <Text color={theme.colors.error} bold wrap="truncate-end">AI Review failed: {reviewErrorSummary(reviewError)}. Press [v] to retry.</Text>
        )}

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
