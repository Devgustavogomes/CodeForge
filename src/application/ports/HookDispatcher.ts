import { HookContext, HookResult } from "../../domain/hook.js";
import { HookReporter } from "./HookReporter.js";

export interface HookDispatcher {
  dispatch(context: HookContext): Promise<HookResult[]>;
  setReporter?(reporter?: HookReporter): void;
}
