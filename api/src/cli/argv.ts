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
  const portIdx = argv.findIndex((a) => a === "--port" || a === "-p");
  if (portIdx !== -1) {
    const raw = argv[portIdx + 1];
    if (raw === undefined) {
      return {
        kind: "error",
        message: `${argv[portIdx]} requires a value (e.g. --port 8080)`,
      };
    }
    const port = Number(raw);
    if (!Number.isInteger(port)) {
      return {
        kind: "error",
        message: `Invalid port "${raw}": must be an integer`,
      };
    }
    if (port < 1 || port > 65535) {
      return {
        kind: "error",
        message: `Invalid port "${raw}": must be between 1 and 65535`,
      };
    }
    return { kind: "run", port };
  }
  if (env.PORT) {
    return { kind: "run", port: Number(env.PORT) };
  }
  return { kind: "run", port: DEFAULT_PORT };
}
