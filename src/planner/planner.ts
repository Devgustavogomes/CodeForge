import type { Spec } from "../domain/spec.js";
import type { Plan } from "../domain/plan.js";

export interface Planner {
  createPlan(spec: Spec): Promise<Plan>;
}
