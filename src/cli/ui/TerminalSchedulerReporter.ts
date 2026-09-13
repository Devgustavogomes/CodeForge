import { SchedulerReporter } from "../../application/ports/SchedulerReporter.js";
import {
  GetSpecStatusUseCase,
  StatusResult,
} from "../../application/use-cases/GetSpecStatusUseCase.js";
import { SupportedLanguage } from "../../config/types.js";
import { translate } from "./i18n.js";
import {
  formatElapsed,
  formatSchedulerSnapshot,
  supportsColor,
} from "./statusFormatter.js";

export type StatusLookup = (specName: string) => StatusResult | undefined;

export interface TerminalSchedulerReporterOptions {
  /** Function or GetSpecStatusUseCase providing status snapshots. */
  getStatus?: StatusLookup | GetSpecStatusUseCase;
  /** Output stream for rendering. Defaults to process.stdout. */
  stream?: NodeJS.WritableStream & { isTTY?: boolean };
  /** Whether ANSI colors and styles should be used. Defaults to terminal detection. */
  color?: boolean;
  /** Whether interactive cursor updates should be used. Defaults to TTY detection without CI. */
  interactive?: boolean;
  /** Clock returning current timestamp in ms. Defaults to Date.now. */
  clock?: () => number;
  /** Language for localized strings. Defaults to "en". */
  language?: SupportedLanguage;
}

export class TerminalSchedulerReporter implements SchedulerReporter {
  private startTime: number = 0;
  private specName?: string;
  private lastLinesCount: number = 0;
  private cursorHidden: boolean = false;
  private readonly getStatus?: StatusLookup;
  private readonly stream: NodeJS.WritableStream & { isTTY?: boolean };
  private readonly color: boolean;
  private readonly interactive: boolean;
  private readonly clock: () => number;
  private readonly language: SupportedLanguage;

  constructor(options: TerminalSchedulerReporterOptions = {}) {
    if (typeof options.getStatus === "function") {
      this.getStatus = options.getStatus;
    } else if (options.getStatus && "execute" in options.getStatus) {
      const uc = options.getStatus;
      this.getStatus = (name: string) => uc.execute(name);
    }

    this.stream = options.stream ?? process.stdout;
    this.clock = options.clock ?? (() => Date.now());
    this.color = options.color ?? supportsColor();
    this.interactive =
      options.interactive ??
      Boolean(this.stream.isTTY && process.env.CI === undefined);
    this.language = options.language ?? "en";
  }

  getStartTime(): number {
    return this.startTime;
  }

  isCursorHidden(): boolean {
    return this.cursorHidden;
  }

  onStart(specName: string): void {
    this.specName = specName;
    this.startTime = this.clock();

    if (this.interactive && !this.cursorHidden) {
      this.stream.write("\x1b[?25l");
      this.cursorHidden = true;
    }

    this.renderSnapshot(specName);
  }

  onUpdate(specName: string): void {
    this.specName = specName;
    if (!this.startTime) {
      this.startTime = this.clock();
    }
    this.renderSnapshot(specName);
  }

  onComplete(specName: string): void {
    this.specName = specName;
    if (!this.startTime) {
      this.startTime = this.clock();
    }
    const elapsedMs = Math.max(0, this.clock() - this.startTime);
    const elapsedStr = formatElapsed(elapsedMs);

    this.renderFinal(specName);

    const message = translate("terminal_run_completed", this.language, {
      spec: specName,
      elapsed: elapsedStr,
    });
    const styled = this.color ? `\x1b[32m${message}\x1b[0m` : message;
    this.stream.write(`\n${styled}\n`);

    this.cleanup();
  }

  onFail(specName: string): void {
    this.specName = specName;
    if (!this.startTime) {
      this.startTime = this.clock();
    }
    const elapsedMs = Math.max(0, this.clock() - this.startTime);
    const elapsedStr = formatElapsed(elapsedMs);

    this.renderFinal(specName);

    const message = translate("terminal_run_failed", this.language, {
      spec: specName,
      elapsed: elapsedStr,
    });
    const styled = this.color ? `\x1b[31m${message}\x1b[0m` : message;
    this.stream.write(`\n${styled}\n`);

    this.cleanup();
  }

  onDeadlock(specName?: string): void {
    const resolvedSpec = specName ?? this.specName ?? "";
    if (resolvedSpec) {
      this.renderFinal(resolvedSpec);
    } else if (this.interactive && this.lastLinesCount > 0) {
      this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      this.lastLinesCount = 0;
    }

    const message = translate("terminal_run_deadlock", this.language, {
      spec: resolvedSpec,
    });
    const styled = this.color ? `\x1b[31m${message}\x1b[0m` : message;
    this.stream.write(`\n${styled}\n`);

    this.cleanup();
  }

  onError(error: string | Error): void {
    if (this.interactive && this.lastLinesCount > 0) {
      this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      this.lastLinesCount = 0;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const noTasksMatch = errorMessage.match(/^No tasks found for spec: (.*)$/);
    const message = noTasksMatch
      ? translate("terminal_run_no_tasks", this.language, {
          spec: noTasksMatch[1],
        })
      : translate("terminal_run_error", this.language, { error: errorMessage });
    const styled = this.color ? `\x1b[31m${message}\x1b[0m` : message;
    this.stream.write(`${styled}\n`);

    this.cleanup();
  }

  onLog?(taskId: string, chunk: string): void {
    // Keep raw agent logs contained so they do not corrupt terminal dashboard output
  }

  cleanup(): void {
    if (this.cursorHidden) {
      this.stream.write("\x1b[?25h");
      this.cursorHidden = false;
    }
  }

  private renderSnapshot(specName: string): void {
    const content = this.getSnapshotContent(specName);
    if (!content) {
      return;
    }

    if (this.interactive) {
      if (this.lastLinesCount > 0) {
        this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      }
      this.stream.write(content + "\n");
      this.lastLinesCount = content.split("\n").length;
    } else {
      this.stream.write(content + "\n");
    }
  }

  private renderFinal(specName: string): void {
    const content = this.getSnapshotContent(specName);
    if (!content) {
      return;
    }

    if (this.interactive) {
      if (this.lastLinesCount > 0) {
        this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
        this.lastLinesCount = 0;
      }
      this.stream.write(content + "\n");
    } else {
      this.stream.write(content + "\n");
    }
  }

  private getSnapshotContent(specName: string): string | undefined {
    const status = this.getStatus?.(specName);
    const elapsedMs = Math.max(0, this.clock() - this.startTime);
    const elapsedStr = formatElapsed(elapsedMs);

    if (status && status.kind === "status") {
      return formatSchedulerSnapshot(status, {
        elapsed: elapsedStr,
        color: this.color,
        language: this.language,
        progressBar: true,
      });
    }

    return undefined;
  }
}
