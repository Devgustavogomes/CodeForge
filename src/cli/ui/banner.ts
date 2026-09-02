export const CODEFORGE_ASCII = [
  "   ____ ___  ____  _____ _____ ___  ____   ____ _____",
  "  / ___/ _ \\|  _ \\| ____|  ___/ _ \\|  _ \\ / ___| ____|",
  " | |  | | | | | | |  _| | |_ | | | | |_) | |  _|  _|  ",
  " | |__| |_| | |_| | |___|  _|| |_| |  _ <| |_| | |___ ",
  "  \\____\\___/|____/|_____|_|   \\___/|_| \\_\\\\____|_____|",
].join("\n");

export function getCodeForgeBanner(): string {
  const cyan = "\x1b[1;36m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  return `${cyan}${CODEFORGE_ASCII}${reset}\n${dim}     Deterministic AI Workflow Engine${reset}\n`;
}

export function printCodeForgeBanner(): void {
  console.log(getCodeForgeBanner());
}
