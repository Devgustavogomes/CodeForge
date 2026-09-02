export class AgentProgressUI {
  private interval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;

  constructor(
    private taskName: string,
    private model: string = "agent",
  ) {}

  start() {
    if (this.interval) return;

    this.startTime = Date.now();

    // Hide cursor
    process.stdout.write("\x1b[?25l");

    this.interval = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.render();
    }, 100);
  }

  private render() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, "0");
    const secs = (elapsed % 60).toString().padStart(2, "0");
    const timeStr = `${mins}:${secs}`;
    const icon = this.frames[this.currentFrame];

    // Move cursor up 6 lines
    process.stdout.write("\x1b[6A");

    const lines = [
      "",
      `  \x1b[1m\x1b[36m╭─────────────────────────────────────────╮\x1b[0m`,
      `  \x1b[1m\x1b[36m│\x1b[0m  🤖 Agent:  \x1b[33m${this.model.padEnd(25)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`,
      `  \x1b[1m\x1b[36m│\x1b[0m  ⏱️  Time:   \x1b[90m${timeStr.padEnd(25)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`,
      `  \x1b[1m\x1b[36m│\x1b[0m  \x1b[36m${icon}\x1b[0m  Status: \x1b[1m${this.taskName.padEnd(25)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`,
      `  \x1b[1m\x1b[36m╰─────────────────────────────────────────╯\x1b[0m`,
    ];

    process.stdout.write(lines.join("\n") + "\n\x1b[J");
  }

  stop(success: boolean = true, message?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, "0");
    const secs = (elapsed % 60).toString().padStart(2, "0");
    const timeStr = `${mins}:${secs}`;

    const icon = success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    const color = success ? "\x1b[32m" : "\x1b[31m";
    const finalMessage = message || (success ? "Completed" : "Failed");

    // Re-render final frame
    process.stdout.write("\x1b[6A");

    const lines = [
      "",
      `  \x1b[1m${color}╭─────────────────────────────────────────╮\x1b[0m`,
      `  \x1b[1m${color}│\x1b[0m  🤖 Agent:  \x1b[33m${this.model.padEnd(25)}\x1b[0m \x1b[1m${color}│\x1b[0m`,
      `  \x1b[1m${color}│\x1b[0m  ⏱️  Time:   \x1b[90m${timeStr.padEnd(25)}\x1b[0m \x1b[1m${color}│\x1b[0m`,
      `  \x1b[1m${color}│\x1b[0m  ${icon}  Status: \x1b[1m${finalMessage.substring(0, 25).padEnd(25)}\x1b[0m \x1b[1m${color}│\x1b[0m`,
      `  \x1b[1m${color}╰─────────────────────────────────────────╯\x1b[0m`,
    ];

    process.stdout.write(lines.join("\n") + "\n\x1b[J");

    process.stdout.write("\x1b[?25h");
  }

  init() {
    process.stdout.write("\n\n\n\n\n\n");
  }
}
