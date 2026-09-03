import { HookDispatcher } from "../../application/ports/HookDispatcher.js";
import { HookContext, HookResult } from "../../domain/hook.js";

/**
 * Used when a workspace configures no hooks. Keeps call sites free of null
 * checks and keeps behaviour identical to a workspace without hook support.
 */
export class NoopHookDispatcher implements HookDispatcher {
  async dispatch(_context: HookContext): Promise<HookResult[]> {
    return [];
  }
}
