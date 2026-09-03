import { HookContext, HookResult } from "../../domain/hook.js";

export interface HookDispatcher {
  dispatch(context: HookContext): Promise<HookResult[]>;
}
