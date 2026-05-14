export type CliAction =
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "run"; port: number };

const DEFAULT_PORT = 3100;

export function parseCliArgs(
  argv: readonly string[],
  env: { PORT?: string } = {}
): CliAction {
  if (argv.includes("--version") || argv.includes("-v")) {
    return { kind: "version" };
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }
  if (env.PORT) {
    return { kind: "run", port: Number(env.PORT) };
  }
  return { kind: "run", port: DEFAULT_PORT };
}
