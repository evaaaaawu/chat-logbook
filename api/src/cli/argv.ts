export type CliAction =
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "run" };

export function parseCliArgs(argv: readonly string[]): CliAction {
  if (argv.includes("--version") || argv.includes("-v")) {
    return { kind: "version" };
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }
  return { kind: "run" };
}
