import {
  ActiveHookInfo,
  CompletedHookInfo,
  HookReporter,
} from "../../application/ports/HookReporter.js";
import { SupportedLanguage } from "../../config/types.js";
import { translate } from "./i18n.js";
import { supportsColor } from "./statusFormatter.js";
import { TerminalSchedulerReporter } from "./TerminalSchedulerReporter.js";

export interface CliHookReporterOptions {
  /** Output stream for rendering. Defaults to process.stdout. */
  stream?: NodeJS.WritableStream & { isTTY?: boolean };
  /** Whether ANSI colors and styles should be used. Defaults to terminal color support. */
  color?: boolean;
  /** Language for localized strings. Defaults to "en". */
  language?: SupportedLanguage;
  /** Coordinator to prevent cursor corruption in interactive mode. */
  terminalReporter?: TerminalSchedulerReporter;
  /** Custom line printer callback. */
  printLine?: (text: string) => void;
}

/**
 * HookReporter implementation for CLI terminal execution.
 * Formats lifecycle hook start, success, and failure notifications with
 * internationalization and optional ANSI color styling, coordinating
 * with TerminalSchedulerReporter in interactive mode.
 */
export class CliHookReporter implements HookReporter {
  private readonly stream: NodeJS.WritableStream & { isTTY?: boolean };
  private readonly color: boolean;
  private readonly language: SupportedLanguage;
  private readonly terminalReporter?: TerminalSchedulerReporter;
  private readonly printLineFn?: (text: string) => void;

  constructor(options: CliHookReporterOptions = {}) {
    this.stream = options.stream ?? process.stdout;
    if (options.color !== undefined) {
      this.color = options.color;
    } else if (options.stream && options.stream.isTTY === false) {
      this.color = false;
    } else {
      this.color = supportsColor();
    }
    this.language = options.language ?? "en";
    this.terminalReporter = options.terminalReporter;
    this.printLineFn = options.printLine;
  }

  isColorEnabled(): boolean {
    return this.color;
  }

  getLanguage(): SupportedLanguage {
    return this.language;
  }

  onHookStart(info: ActiveHookInfo): void {
    const message = translate("cli_hook_starting", this.language, {
      name: info.definition.name,
      event: info.event,
      command: info.definition.run,
    });
    const formatted = this.color ? `\x1b[36m${message}\x1b[0m` : message;
    this.print(formatted);
  }

  onHookEnd(info: CompletedHookInfo): void {
    if (info.result.ok) {
      const message = translate("cli_hook_success", this.language, {
        name: info.definition.name,
        event: info.event,
        duration: Math.round(info.durationMs),
      });
      const formatted = this.color ? `\x1b[32m${message}\x1b[0m` : message;
      this.print(formatted);
    } else {
      const exitCode =
        info.result.exitCode !== null && info.result.exitCode !== undefined
          ? info.result.exitCode
          : 1;
      const message = translate("cli_hook_failed", this.language, {
        name: info.definition.name,
        event: info.event,
        exitCode,
      });
      const formatted = this.color ? `\x1b[31m${message}\x1b[0m` : message;

      const lines = [formatted];
      if (info.result.output && info.result.output.trim().length > 0) {
        const snippetLines = info.result.output
          .trim()
          .split(/\r?\n/)
          .slice(0, 3);
        for (const line of snippetLines) {
          lines.push(`    ${line}`);
        }
      }

      this.print(lines.join("\n"));
    }
  }

  private print(text: string): void {
    if (this.printLineFn) {
      this.printLineFn(text);
    } else if (this.terminalReporter) {
      this.terminalReporter.printLine(text);
    } else {
      this.stream.write(text.endsWith("\n") ? text : `${text}\n`);
    }
  }
}
