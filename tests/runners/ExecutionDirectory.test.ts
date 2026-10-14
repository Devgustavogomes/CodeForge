import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { CodexRunner } from "../../src/runners/CodexRunner.js";
import { ClaudeRunner } from "../../src/runners/ClaudeRunner.js";
import { CursorRunner } from "../../src/runners/CursorRunner.js";
import { AntigravityRunner } from "../../src/runners/AntigravityRunner.js";
import { BaseProcessRunner } from "../../src/runners/BaseProcessRunner.js";
import { TaskContext } from "../../src/runners/AgentRunner.js";
import { FakeProcessExecutor } from "../helpers/fake-process-executor.js";

class EchoRunner extends BaseProcessRunner {
  execute(context: TaskContext): Promise<void> {
    return this.spawnProcess(process.execPath, ["-e", 'process.stdout.write(process.cwd() + "\\n"); process.stdin.pipe(process.stdout);'], context, {
      cwd: "ignored-directory", pipePromptToStdin: true,
    });
  }
}

describe("execution directory forwarding", () => {
  it.skipIf(process.platform !== "win32").each([["codex", CodexRunner], ["claude", ClaudeRunner], ["agent", CursorRunner], ["agy", AntigravityRunner]] as const)("forwards Windows paths with spaces through %s", async (command, Runner) => {
    const executor = new FakeProcessExecutor();
    const cwd = String.raw`C:\Work Trees\task one`;
    const promptFilePath = String.raw`C:\Central Context\task.md`;
    await new Runner(executor).execute({ cwd, promptFilePath, intentName: "intent", silent: true });
    const call = executor.spawnCalls[0];
    expect(call.command).toBe(command);
    expect(call.options?.cwd).toBe(cwd);
    if (command === "agy") {
      expect(call.args.slice(0, 2)).toEqual(["-p", promptFilePath]);
      expect(call.args.slice(-2)).toEqual(["--add-dir", cwd]);
    } else expect(call.options?.pipePromptFile).toBe(promptFilePath);
    if (command === "codex") expect(call.args.slice(-3)).toEqual(["--cd", cwd, "-"]);
  });

  it.each([CodexRunner, ClaudeRunner, CursorRunner, AntigravityRunner])("resolves relative prompts against the selected directory", async (Runner) => {
    const executor = new FakeProcessExecutor();
    const cwd = path.resolve("work trees/task two");
    await new Runner(executor).execute({ cwd, promptFilePath: "context/prompt.md", intentName: "intent" });
    const call = executor.spawnCalls[0];
    const prompt = path.resolve(cwd, "context/prompt.md");
    if (Runner === AntigravityRunner) expect(call.args[1]).toBe(prompt);
    else expect(call.options?.pipePromptFile).toBe(prompt);
  });

  it("reads an absolute prompt outside the child directory without changing the parent cwd", async () => {
    const originalCwd = process.cwd();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codeforge runner "));
    try {
      const cwd = path.join(directory, "execution directory");
      const promptFilePath = path.join(directory, "central prompt.md");
      await fs.mkdir(cwd);
      await fs.writeFile(promptFilePath, "external prompt content");
      let output = "";
      await new EchoRunner().execute({ cwd, promptFilePath, intentName: "intent", silent: true, onLog: (chunk) => { output += chunk; } });
      expect(output).toBe(cwd + "\nexternal prompt content");
      expect(process.cwd()).toBe(originalCwd);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
