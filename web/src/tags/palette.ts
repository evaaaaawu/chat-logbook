// The closed Tag color vocabulary (ADR-0015): eight semantic tokens from the
// Solarized accent set. The token is what we store; this map is the single
// place that resolves token → hex for every Tag surface (chips, dots, swatches,
// the future Spotlight picker). Re-theming is a remap here, not a data change.
export const TAG_COLOR_TOKENS = [
  "yellow",
  "orange",
  "red",
  "magenta",
  "violet",
  "blue",
  "cyan",
  "green",
] as const;

export type ColorToken = (typeof TAG_COLOR_TOKENS)[number];

export const TAG_COLOR_HEX: Record<ColorToken, string> = {
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900",
};

export function isColorToken(value: string): value is ColorToken {
  return (TAG_COLOR_TOKENS as readonly string[]).includes(value);
}

// Solarized base03 — the dark text color used on light-filled chips.
const DARK_TEXT = "#002b36";
const LIGHT_TEXT = "#ffffff";

function srgbToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrast(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// Pick the readable text color for a filled chip: whichever of white / base03
// has the higher contrast against the tag's background. Light tokens (yellow,
// cyan, green) land on dark text; the rest on white — all eight stay legible.
const DARK_TEXT_LUMINANCE = relativeLuminance(DARK_TEXT);
export const TAG_TEXT_HEX: Record<ColorToken, string> = Object.fromEntries(
  TAG_COLOR_TOKENS.map((token) => {
    const bg = relativeLuminance(TAG_COLOR_HEX[token]);
    const onWhite = contrast(bg, 1);
    const onDark = contrast(bg, DARK_TEXT_LUMINANCE);
    return [token, onWhite >= onDark ? LIGHT_TEXT : DARK_TEXT];
  })
) as Record<ColorToken, string>;

// The default color picked when a Tag is created inline, before the user
// overrides it. Derived from the Tag name so repeated creates of the same name
// land on a stable swatch, but any of the eight is a one-click override.
export function defaultColorFor(name: string): ColorToken {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TAG_COLOR_TOKENS.length;
  return TAG_COLOR_TOKENS[index];
}
