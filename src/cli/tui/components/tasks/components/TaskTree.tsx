import React from 'react';
import { Box, Text } from 'ink';
import { TaskStatus } from '../../../../../domain/execution.js';

export interface TaskScreenItem {
  id: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  objective?: string;
  files?: string[];
  context?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
  errors?: string[];
}

export const STATUS_ICONS: Record<
  TaskStatus,
  { icon: string; color: string; label: string }
> = {
  pending: { icon: '○', color: 'gray', label: '[PENDING]' },
  running: { icon: '▶', color: 'yellow', label: '[RUNNING]' },
  completed: { icon: '✓', color: 'green', label: '[COMPLETED]' },
  failed: { icon: '✗', color: 'red', label: '[FAILED]' },
};

export interface TaskTreeProps {
  tasks: TaskScreenItem[];
  visibleTasks: TaskScreenItem[];
  selectedTaskId: string | null;
  specs: string[];
  selectedSpecIndex: number;
  currentSpec: string;
  isSideBySide: boolean;
}

function calculateDepth(task: TaskScreenItem, allTasks: TaskScreenItem[], visited = new Set<string>()): number {
  if (!task.dependencies || task.dependencies.length === 0) return 0;
  if (visited.has(task.id)) return 0;
  visited.add(task.id);

  let maxDepth = 0;
  for (const depId of task.dependencies) {
    const depTask = allTasks.find((t) => t.id === depId);
    if (depTask) {
      maxDepth = Math.max(maxDepth, 1 + calculateDepth(depTask, allTasks, new Set(visited)));
    } else {
      maxDepth = Math.max(maxDepth, 1);
    }
  }
  return Math.min(maxDepth, 3);
}

export const TaskTree: React.FC<TaskTreeProps> = ({
  tasks,
  visibleTasks,
  selectedTaskId,
  specs,
  selectedSpecIndex,
  currentSpec,
  isSideBySide,
}) => {
  return (
    <Box
      flexDirection="column"
      width={isSideBySide ? '45%' : '100%'}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1} flexShrink={1}>
          <Text bold color="yellow">
            Tasks ({tasks.length})
          </Text>
          {specs.length > 0 ? (
            <Box gap={1} flexShrink={1}>
              {specs.length <= 3 ? (
                specs.map((sp, idx) => {
                  const isSelected = idx === selectedSpecIndex;
                  return (
                    <Text
                      key={sp}
                      color={isSelected ? 'yellow' : 'gray'}
                      bold={isSelected}
                    >
                      {isSelected ? `● [${sp}]` : `○ ${sp}`}
                    </Text>
                  );
                })
              ) : (
                <Box gap={1}>
                  <Text color="yellow" bold>
                    ● [{currentSpec}]
                  </Text>
                  <Text dimColor>
                    ({selectedSpecIndex + 1}/{specs.length})
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text dimColor>• No Spec</Text>
          )}
        </Box>
        <Box flexShrink={0}>
          <Text dimColor>[←/→] Spec</Text>
        </Box>
      </Box>

      {tasks.length === 0 ? (
        <Box paddingY={2} justifyContent="center">
          <Text dimColor>No tasks found for spec "{currentSpec}".</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleTasks.map((task) => {
            const isSelected = task.id === selectedTaskId;
            const statusInfo = STATUS_ICONS[task.status] ?? STATUS_ICONS.pending;
            const depth = calculateDepth(task, tasks);
            const indent = depth > 0 ? '  '.repeat(depth) : '';

            return (
              <Box
                key={task.id}
                justifyContent="space-between"
                width="100%"
              >
                <Box gap={1} flexShrink={1}>
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                    {isSelected ? '❯' : ' '}
                  </Text>
                  {indent.length > 0 && <Text dimColor>{indent}</Text>}
                  <Text color={statusInfo.color} bold>
                    {statusInfo.icon} {task.id}
                  </Text>
                  <Text
                    color={isSelected ? 'cyan' : 'white'}
                    wrap="truncate-end"
                  >
                    {task.title}
                  </Text>
                </Box>
                <Box flexShrink={0} paddingLeft={1}>
                  <Text color={statusInfo.color}>{statusInfo.label}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
