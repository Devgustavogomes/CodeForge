import { SchedulerReporter } from "../../application/ports/SchedulerReporter.js";
import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { getSpecStatus, formatStatusOutput } from "../../application/status.js";

export class TerminalSchedulerReporter implements SchedulerReporter {
  private intervalId?: NodeJS.Timeout;

  private sigintHandler = () => {
    this.stopTimer();
    this.restoreTerminal();
    process.exit(0);
  };

  constructor(private readonly gw: WorkspaceGateway) {}

  private getFormattedStatus(specName: string): string {
    const result = getSpecStatus(this.gw, specName);
    if (result.kind === "status") {
      return formatStatusOutput(result);
    }
    return "";
  }

  onStart(specName: string): void {
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    process.on("SIGINT", this.sigintHandler);
    this.printStatus(specName);
    
    this.intervalId = setInterval(() => {
      this.printStatus(specName);
    }, 1000);
  }

  onUpdate(specName: string): void {
    this.printStatus(specName);
  }

  onComplete(specName: string): void {
    this.stopTimer();
    this.restoreTerminal();
    console.log(this.getFormattedStatus(specName));
    console.log(
      "\n\x1b[32m\x1b[1m✓ Spec execution completed successfully!\x1b[0m\n",
    );
  }

  onDeadlock(): void {
    this.stopTimer();
    this.restoreTerminal();
    console.error(
      "\n\x1b[31m\x1b[1m✗ Deadlock detected: No tasks can be executed because their dependencies are not met or failed.\x1b[0m\n",
    );
  }

  onError(error: string | Error): void {
    this.stopTimer();
    this.restoreTerminal();
    console.error(
      `\n\x1b[31m\x1b[1m✗ Error executing spec:\x1b[0m ${error instanceof Error ? error.message : error}\n`,
    );
  }

  private printStatus(specName: string): void {
    process.stdout.write("\x1b[H" + this.getFormattedStatus(specName) + "\x1b[J");
  }

  private restoreTerminal(): void {
    process.stdout.write("\x1b[?25h\x1b[?1049l");
    process.off("SIGINT", this.sigintHandler);
  }

  private stopTimer(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
