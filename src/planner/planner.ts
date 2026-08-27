import type { Plan } from "../domain/plan.js";

export interface Planner {
  createPlan(spec: string): Promise<Plan>;
}
