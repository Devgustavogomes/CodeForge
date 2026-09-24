import type { Task } from "./task.js";

export interface Plan {
  intentId: string;
  tasks: Task[];
}
