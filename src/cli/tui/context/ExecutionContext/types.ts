import React from 'react';
import { TaskScheduler, SchedulerStatus } from '../../../../scheduler/TaskScheduler.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { HookEvent, HookType } from '../../../../domain/hook.js';
import { HookReporter } from '../../../../application/ports/HookReporter.js';
import { TaskItem } from './taskLoader.js';

export type ExecutionStatus = SchedulerStatus;
export type { SchedulerStatus, TaskItem, HookEvent, HookType };

export interface ActiveHookState {
  name: string;
  event: HookEvent;
  command: string;
  type: HookType;
  taskId?: string;
  startedAt: number;
}

export interface HookHistoryItem {
  id: string;
  name: string;
  event: HookEvent;
  command: string;
  type: HookType;
  ok: boolean;
  exitCode: number | null;
  outputSummary?: string;
  durationMs: number;
  timestamp: string;
}

export interface ExecutionContextValue {
  activeHook: ActiveHookState | null;
  hookHistory: HookHistoryItem[];
  hasConfiguredHooks?: boolean;
  activeIntent: string | null;  tasks: TaskItem[];
  selectedTaskId: string | null;
  selectedTask: TaskItem | null;
  status: ExecutionStatus;
  schedulerStatus: ExecutionStatus;
  logs: Record<string, string[]>;
  getTaskLogs: (taskId: string) => string[];
  setSelectedTaskId: (taskId: string | null) => void;
  selectTask: (taskId: string | null) => void;
  setActiveIntent: (intentName: string | null) => void;  startRun: (intentName?: string) => Promise<void>;
  retryTask: (taskId: string, intentName?: string) => Promise<void>;
  retryAllFailed: (intentName?: string) => Promise<void>;
  completeTask: (taskId: string, intentName?: string) => Promise<void>;
  resetTask: (taskId: string, intentName?: string) => Promise<void>;
  resetAllTasks: (intentName?: string) => Promise<void>;
  refreshTasks?: (intent: string) => void;
  clearLogs: (taskId?: string) => void;
  scheduler: TaskScheduler | null;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionProviderProps {
  children: React.ReactNode;
  scheduler?: TaskScheduler;
  container?: AppContainer;
  initialIntent?: string;  autoStart?: boolean;
  maxLogLines?: number;
  flushIntervalMs?: number;
  hookReporter?: HookReporter;
}
