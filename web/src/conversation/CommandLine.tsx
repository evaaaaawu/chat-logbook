interface CommandLineProps {
  /** The command name, including the leading slash (e.g. `/tdd`). */
  name: string;
  /** The arguments typed after the command; empty when none. */
  args: string;
}

/**
 * A slash-command invocation, read as the reader's own message: the command
 * name in the interactive accent, its args following as plain prose. The plugin
 * already translated the Agent's markup into a command block at normalize time,
 * so this only renders it (ADR-0023). Matches Claude Code desktop — no chip, no
 * icon; args wrap in full, preserving blank lines, since a command can carry a
 * whole multi-line prompt.
 */
export function CommandLine({ name, args }: CommandLineProps) {
  return (
    <div
      data-testid="command-line"
      className="whitespace-pre-wrap break-words leading-relaxed"
    >
      <span className="font-medium text-primary">{name}</span>
      {args ? ` ${args}` : ""}
    </div>
  );
}
