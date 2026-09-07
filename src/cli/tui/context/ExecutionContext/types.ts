import React from 'react';
import { TaskScheduler, SchedulerStatus } from '../../../../scheduler/TaskScheduler.js';
import { AppContainer } from '../../../../infrastructure/container.js';
import { TaskItem } from './taskLoader.js';

export type ExecutionStatus = SchedulerStatus;
export type { SchedulerStatus, TaskItem };

export interface ExecutionContextValue {
  activeSpec: string | null;
  tasks: TaskItem[];
  selectedTaskId: string | null;
  selectedTask: TaskItem | null;
  status: ExecutionStatus;
  schedulerStatus: ExecutionStatus;
  logs: Record<string, string[]>;
  getTaskLogs: (taskId: string) => string[];
  setSelectedTaskId: (taskId: string | null) => void;
  selectTask: (taskId: string | null) => void;
  setActiveSpec: (specName: string | null) => void;
  startRun: (specName?: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  resetTask: (taskId: string) => Promise<void>;
  resetAllTasks: (specName?: string) => Promise<void>;
  clearLogs: (taskId?: string) => void;
  scheduler: TaskScheduler | null;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionProviderProps {
  children: React.ReactNode;
  scheduler?: TaskScheduler;
  container?: AppContainer;
  initialSpec?: string;
  autoStart?: boolean;
  maxLogLines?: number;
}
