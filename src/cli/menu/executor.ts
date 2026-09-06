import { input } from "@inquirer/prompts";
import { MenuAction, ActionResult } from "./types.js";
import { initAction } from "../commands/init.js";
import { configAction } from "../commands/config.js";
import { runAction } from "../commands/run.js";
import { statusAction } from "../commands/status.js";
import { specCreateAction } from "../commands/spec/create.js";
import { specPullAction } from "../commands/spec/pull.js";
import { planGenerateAction } from "../commands/plan/generate.js";
import { planValidateAction } from "../commands/plan/validate.js";
import { taskInfoAction } from "../commands/task/info.js";
import { taskCompleteAction } from "../commands/task/complete.js";
import { taskRetryAction } from "../commands/task/retry.js";
import { taskResetAction } from "../commands/task/reset.js";
import { docsCreateAction } from "../commands/docs/create.js";
import { docsUpdateAction } from "../commands/docs/update.js";

async function dispatchCommand(args: string[], options: Record<string, string> = {}): Promise<ActionResult> {
  const [cmd, subCmd, ...rest] = args;

  if (cmd === "init") {
    return initAction();
  }

  if (cmd === "config") {
    return configAction();
  }

  if (cmd === "run") {
    return runAction(subCmd);
  }

  if (cmd === "status") {
    return statusAction(subCmd);
  }

  if (cmd === "spec") {
    if (subCmd === "create") {
      return specCreateAction(rest[0]);
    }
    if (subCmd === "pull") {
      return specPullAction(rest[0]);
    }
  }

  if (cmd === "plan") {
    if (subCmd === "generate") {
      return planGenerateAction(rest[0]);
    }
    if (subCmd === "validate") {
      return planValidateAction(rest[0], rest[1]);
    }
  }

  if (cmd === "task") {
    if (subCmd === "info") {
      return taskInfoAction(rest[0], rest[1]);
    }
    if (subCmd === "complete") {
      return taskCompleteAction(rest[0], rest[1]);
    }
    if (subCmd === "retry") {
      return taskRetryAction(rest[0]);
    }
    if (subCmd === "reset") {
      return taskResetAction(rest[0], rest[1]);
    }
  }

  if (cmd === "docs") {
    if (subCmd === "create") {
      return docsCreateAction(rest[0]);
    }
    if (subCmd === "update") {
      return docsUpdateAction(rest[0], options);
    }
  }

  return { success: false };
}

export async function executeAction(action: MenuAction): Promise<ActionResult> {
  if (action.type === "command") {
    console.log("");
    return dispatchCommand(action.args);
  }

  if (action.type === "command-with-input") {
    const userInput = await input({
      message: action.inputLabel,
    });

    if (!userInput || userInput.trim().length === 0) {
      console.error("\n✗ Nome do doc não pode ser vazio.\n");
      return { success: false };
    }

    console.log("");
    const options: Record<string, string> = {};
    if (action.inputFlag) {
      const flagKey = action.inputFlag.replace(/^--/, "");
      options[flagKey] = userInput.trim();
    }

    return dispatchCommand(action.args, options);
  }

  return { success: true };
}
