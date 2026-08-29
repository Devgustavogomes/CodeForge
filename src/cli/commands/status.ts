import { NodeWorkspaceGateway } from "../../infrastructure/workspace.js";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { getAvailableSpecs } from "../../application/plan.js";
import { getSpecStatus, formatStatusOutput } from "../../application/status.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status [spec]")
    .description("Show execution progress for a spec (watches by default)")
    .option("--once", "Print status once and exit")
    .action(async (spec: string | undefined, options: { once?: boolean }) => {
      const gw = new NodeWorkspaceGateway(process.cwd());
      let specName = spec;

      if (!specName) {
        const specs = getAvailableSpecs(gw);

        if (specs.length === 0) {
          console.error("\n✗ No specs found.\n");
          process.exitCode = 1;
          return;
        }

        specName = await select({
          message: "Select a spec to view status:",
          choices: specs.map((s) => ({ name: s, value: s })),
        });
      }

      // Validate once before entering loop
      const initial = getSpecStatus(gw, specName);

      switch (initial.kind) {
        case "not-initialized":
          console.error("\n✗ CodeForge is not initialized. Run `codeforge init` first.\n");
          process.exitCode = 1;
          return;
        case "spec-not-found":
          console.error(`\n✗ No tasks directory found for spec: ${specName}\n`);
          process.exitCode = 1;
          return;
        case "no-execution":
          console.log(`\n○ No execution started for spec '${specName}'. Run \`codeforge run ${specName}\` to begin.\n`);
          return;
        case "status":
          if (options.once) {
            console.log(formatStatusOutput(initial));
            return;
          }
          break;
      }

      // Watch mode — enter alternate screen buffer (like vim/htop)
      process.stdout.write("\x1b[?1049h\x1b[?25l");

      const cleanup = () => {
        clearInterval(interval);
        // Leave alternate screen buffer and restore cursor
        process.stdout.write("\x1b[?25h\x1b[?1049l");
      };

      const render = () => {
        const result = getSpecStatus(gw, specName);
        process.stdout.write("\x1b[H");
        if (result.kind === "status") {
          process.stdout.write(formatStatusOutput(result));
          process.stdout.write("  \x1b[2mWatching for changes... (Ctrl+C to exit)\x1b[0m\n\n");
        } else {
          process.stdout.write("  \x1b[2mWaiting for execution to start... (Ctrl+C to exit)\x1b[0m\n\n");
        }
        return result;
      };

      let lastResult = render();

      const interval = setInterval(() => {
        lastResult = render();

        if (lastResult.kind === "status") {
          const allDone = lastResult.tasks.every((t) => t.status === "completed");
          if (allDone) {
            cleanup();
            console.log(`\n🎉 All tasks for spec '${specName}' completed!\n`);
          }
        }
      }, 2000);

      process.stdout.on("resize", () => render());

      process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
    });
}
