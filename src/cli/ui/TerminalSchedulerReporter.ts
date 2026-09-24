import { ReviewErrorMetadata, ReviewStartMetadata, SchedulerReporter } from "../../application/ports/SchedulerReporter.js";
import { ReviewResultMetadata } from "../../domain/hook.js";
import {
  GetIntentStatusUseCase,
  IntentStatusResult,
} from "../../application/use-cases/GetIntentStatusUseCase.js";
import { SupportedLanguage } from "../../config/types.js";
import { translate } from "./i18n.js";
import {
  formatElapsed,
  formatSchedulerSnapshot,
  supportsColor,
} from "./statusFormatter.js";

export type StatusLookup = (intentName: string) => IntentStatusResult | undefined;
export type StatusResult = IntentStatusResult;

export interface TerminalSchedulerReporterOptions {
  /** Function or GetIntentStatusUseCase providing status snapshots. */
  getStatus?: StatusLookup | GetIntentStatusUseCase | { execute: (name: string) => IntentStatusResult };
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
  private intentName?: string;
  private lastLinesCount: number = 0;
  private cursorHidden: boolean = false;
  private finished: boolean = false;
  private refreshTimer?: NodeJS.Timeout;
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

  isFinished(): boolean {
    return this.finished;
  }

  onStart(intentName: string): void {
    this.cleanup();
    this.intentName = intentName;
    this.startTime = this.clock();
    this.finished = false;

    if (this.interactive && !this.cursorHidden) {
      this.stream.write("\x1b[?25l");
      this.cursorHidden = true;
    }

    this.renderSnapshot(intentName);
    if (this.interactive) {
      this.refreshTimer = setInterval(() => {
        if (this.intentName && !this.finished) this.renderSnapshot(this.intentName);
      }, 1000);
      this.refreshTimer.unref();
    }
  }

  onUpdate(intentName: string): void {
    this.intentName = intentName;
    if (!this.startTime) {
      this.startTime = this.clock();
    }
    this.renderSnapshot(intentName);
  }

  onComplete(intentName: string): void {
    this.finished = true;
    this.intentName = intentName;
    if (!this.startTime) {
      this.startTime = this.clock();
    }
    const elapsedMs = Math.max(0, this.clock() - this.startTime);
    const elapsedStr = formatElapsed(elapsedMs);

    this.renderFinal(intentName);

    const message = translate("terminal_run_completed", this.language, {
      intent: intentName,
      elapsed: elapsedStr,
    });
    const styled = this.color ? `\x1b[32m${message}\x1b[0m` : message;
    this.stream.write(`\n${styled}\n`);

    this.cleanup();
  }

  onFail(intentName: string): void {
    this.finished = true;
    this.intentName = intentName;
    if (!this.startTime) {
      this.startTime = this.clock();
    }
    const elapsedMs = Math.max(0, this.clock() - this.startTime);
    const elapsedStr = formatElapsed(elapsedMs);

    this.renderFinal(intentName);

    const message = translate("terminal_run_failed", this.language, {
      intent: intentName,
      elapsed: elapsedStr,
    });
    const styled = this.color ? `\x1b[31m${message}\x1b[0m` : message;
    this.stream.write(`\n${styled}\n`);

    this.cleanup();
  }

  onDeadlock(intentName?: string): void {
    this.finished = true;
    const resolvedIntent = intentName ?? this.intentName ?? "";
    if (resolvedIntent) {
      this.renderFinal(resolvedIntent);
    } else if (this.interactive && this.lastLinesCount > 0) {
      this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      this.lastLinesCount = 0;
    }

    const message = translate("terminal_run_deadlock", this.language, {
      intent: resolvedIntent,
    });
    const styled = this.color ? `\x1b[31m${message}\x1b[0m` : message;
    this.stream.write(`\n${styled}\n`);

    this.cleanup();
  }

  onError(error: string | Error): void {
    this.finished = true;
    if (this.interactive && this.lastLinesCount > 0) {
      this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      this.lastLinesCount = 0;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const noTasksMatch = errorMessage.match(/^No tasks found for (?:intent|intent): (.*)$/);
    const message = noTasksMatch
      ? translate("terminal_run_no_tasks", this.language, {
          intent: noTasksMatch[1],
        })
      : translate("terminal_run_error", this.language, { error: errorMessage });
    const styled = this.color ? `\x1b[31m${message}\x1b[0m` : message;
    this.stream.write(`${styled}\n`);

    this.cleanup();
  }

  onReviewStart(intentName: string, metadata: ReviewStartMetadata): void {
    this.intentName = intentName;
    if (!this.startTime) this.startTime = this.clock();
    this.printLine(translate("terminal_review_started", this.language, {
      agent: metadata.agent,
      round: metadata.round,
      maxRounds: metadata.maxRounds,
    }));
  }

  onReviewEnd(intentName: string, result: ReviewResultMetadata): void {
    this.intentName = intentName;
    if (result.outcome === "approved") {
      this.printLine(translate("terminal_review_approved", this.language));
      return;
    }

    this.finished = true;
    this.settleSnapshot();
    this.stream.write(`${translate("terminal_review_tasks_created", this.language, {
      count: result.newTasksCount,
      taskIds: result.taskIds.join(", "),
    })}\n`);
    this.stream.write(`${translate("terminal_review_rerun", this.language, { intent: intentName })}\n`);
    this.cleanup();
  }

  onReviewError(intentName: string, error: ReviewErrorMetadata): void {
    this.intentName = intentName;
    this.finished = true;
    this.settleSnapshot();
    this.stream.write(`${translate("terminal_review_error", this.language, {
      error: error.message,
      round: error.round,
    })}\n`);
    this.cleanup();
  }

  onLog?(_taskId: string, _chunk: string): void {
    // Keep raw agent logs contained so they do not corrupt terminal dashboard output
  }

  cleanup(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.cursorHidden) {
      this.stream.write("\x1b[?25h");
      this.cursorHidden = false;
    }
  }

  /**
   * Prints a log or hook message cleanly without corrupting the live scheduler snapshot.
   * In interactive mode, clears the active snapshot, writes the line, and redraws the snapshot.
   */
  printLine(text: string): void {
    const formatted = text.endsWith("\n") ? text : `${text}\n`;
    if (this.interactive && this.lastLinesCount > 0) {
      this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      this.lastLinesCount = 0;
      this.stream.write(formatted);
      if (this.intentName && !this.finished) {
        this.renderSnapshot(this.intentName);
      }
    } else {
      this.stream.write(formatted);
    }
  }

  private renderSnapshot(intentName: string): void {
    const content = this.getSnapshotContent(intentName);
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

  private settleSnapshot(): void {
    if (this.interactive && this.lastLinesCount > 0) {
      this.stream.write(`\x1b[${this.lastLinesCount}A\x1b[0J`);
      this.lastLinesCount = 0;
    }
  }

  private renderFinal(intentName: string): void {
    const content = this.getSnapshotContent(intentName);
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

  private getSnapshotContent(intentName: string): string | undefined {
    const status = this.getStatus?.(intentName);
    const elapsedMs = Math.max(0, this.clock() - this.startTime);
    const elapsedStr = formatElapsed(elapsedMs);

    if (status && status.kind === "status") {
      return formatSchedulerSnapshot(status, {
        elapsed: elapsedStr,
        snapshotAt: new Date(this.clock()).toISOString(),
        color: this.color,
        language: this.language,
        progressBar: true,
      });
    }

    return undefined;
  }
}
