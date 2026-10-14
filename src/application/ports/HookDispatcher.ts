import { HookContext, HookResult } from "../../domain/hook.js";
import { HookReporter } from "./HookReporter.js";

export interface HookDispatcher {
  /** Execute hooks in context.cwd for each invocation. */
  dispatch(context: HookContext): Promise<HookResult[]>;
  setReporter?(reporter?: HookReporter): void;
}
