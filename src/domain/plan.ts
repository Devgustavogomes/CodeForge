import type { Task } from "./task.js";

export interface Plan {
  specId: string;
  tasks: Task[];
}
