// The closed Tag color vocabulary (ADR-0015): eight semantic tokens drawn from
// the Solarized accent set. A Tag stores one of these tokens, never a raw hex —
// rendering resolves token→hex through one shared palette map. Adding a ninth
// color is a deliberate palette change, not user free-form input.
export const TAG_COLORS = [
  "yellow",
  "orange",
  "red",
  "magenta",
  "violet",
  "blue",
  "cyan",
  "green",
] as const;

export type ColorToken = (typeof TAG_COLORS)[number];

export function isColorToken(value: unknown): value is ColorToken {
  return (
    typeof value === "string" &&
    (TAG_COLORS as readonly string[]).includes(value)
  );
}
