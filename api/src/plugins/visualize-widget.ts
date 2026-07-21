/**
 * Agent-produced drawings from the `visualize` MCP server.
 *
 * The call arrives as an ordinary `tool_use` block whose `widget_code` holds
 * either an SVG document or an HTML fragment. Only the SVG half becomes an
 * image: HTML widgets are worth archiving for their interactivity, which would
 * mean executing archived code, so they stay a collapsed tool row instead.
 */

/** The tool name every visualize drawing arrives under. */
export const SHOW_WIDGET_TOOL = "mcp__visualize__show_widget";

/**
 * The widget's SVG source, or null when this is not an SVG widget call.
 * Accepts anything shaped like a `tool_use` block so both the normalize path
 * and the ref-resolution path can ask the same question.
 */
export function svgWidgetCode(block: unknown): string | null {
  if (!block || typeof block !== "object") return null;
  const b = block as Record<string, unknown>;
  if (b.type !== "tool_use" || b.name !== SHOW_WIDGET_TOOL) return null;

  const input = b.input as Record<string, unknown> | undefined;
  const code = input?.widget_code;
  if (typeof code !== "string") return null;

  // The same test the harness itself uses to pick its render mode.
  return code.trimStart().startsWith("<svg") ? code : null;
}

// The nine categorical ramps a widget's `c-{ramp}` classes name, in the three
// stops dark mode uses: 800 fills the shape, 200 strokes it and carries the
// subtitle, 100 carries the title. Copied verbatim from the visualize palette
// rather than remapped onto chat-logbook's own colors — the ramps carry meaning
// (red is an error, green a success), and recoloring them would rewrite what
// the drawing says.
const RAMPS: Record<string, { fill: string; stroke: string; title: string }> = {
  "c-purple": { fill: "#3C3489", stroke: "#AFA9EC", title: "#CECBF6" },
  "c-teal": { fill: "#085041", stroke: "#5DCAA5", title: "#9FE1CB" },
  "c-coral": { fill: "#712B13", stroke: "#F0997B", title: "#F5C4B3" },
  "c-pink": { fill: "#72243E", stroke: "#ED93B1", title: "#F4C0D1" },
  "c-gray": { fill: "#444441", stroke: "#B4B2A9", title: "#D3D1C7" },
  "c-blue": { fill: "#0C447C", stroke: "#85B7EB", title: "#B5D4F4" },
  "c-green": { fill: "#27500A", stroke: "#97C459", title: "#C0DD97" },
  "c-amber": { fill: "#633806", stroke: "#EF9F27", title: "#FAC775" },
  "c-red": { fill: "#791F1F", stroke: "#F09595", title: "#F7C1C1" },
};

// Text outside any ramp, in chat-logbook's own palette so a bare diagram sits in
// the conversation rather than on top of it. Literal hex, not `var(--…)`: an SVG
// served as an image is its own document and never sees the app's stylesheet.
const TEXT_PRIMARY = "#eee8d5";
const TEXT_SECONDARY = "#93a1a1";
const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

function widgetStylesheet(): string {
  const ramps = Object.entries(RAMPS)
    .map(
      ([name, c]) =>
        `.${name}>rect,.${name}>circle,.${name}>ellipse,` +
        `rect.${name},circle.${name},ellipse.${name}` +
        `{fill:${c.fill};stroke:${c.stroke};stroke-width:1.5}` +
        `.${name}>text.t,.${name}>text.th{fill:${c.title}}` +
        `.${name}>text.ts{fill:${c.stroke}}`
    )
    .join("");
  return (
    `text{font-family:${FONT_SANS}}` +
    `.t{font-size:14px;fill:${TEXT_PRIMARY}}` +
    `.th{font-size:14px;font-weight:500;fill:${TEXT_PRIMARY}}` +
    `.ts{font-size:12px;fill:${TEXT_SECONDARY}}` +
    ramps
  );
}

/**
 * The widget's SVG with the harness's class definitions folded in.
 *
 * A visualize SVG carries no colors of its own: every `<text>` wears `t`/`ts`/
 * `th` and every node a `c-{ramp}` class, all defined in a stylesheet the
 * harness wraps around the drawing. Served on its own, those classes match
 * nothing and the whole drawing falls back to SVG's default black-on-nothing.
 *
 * Returned unchanged when there is no root element to inject into — a broken
 * widget is better served as its own broken self than mangled.
 */
export function themeWidgetSvg(svg: string): string {
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) return svg;

  const sized = withIntrinsicSize(root[0]);
  const at = root.index + root[0].length;
  return (
    svg.slice(0, root.index) +
    sized +
    `<style>${widgetStylesheet()}</style>` +
    svg.slice(at)
  );
}

/**
 * The opening `<svg>` tag with `width`/`height` filled in from its viewBox.
 *
 * A visualize SVG declares only a viewBox, which is enough inside the harness
 * but not in an `<img>`: with no intrinsic size the browser hands the element a
 * 300×150 placeholder, and a `width: auto` thumbnail collapses to nothing. The
 * viewBox already states the drawing's own pixel units, so copying them across
 * is what the widget meant all along.
 *
 * A widget that sized itself keeps its own numbers.
 */
function withIntrinsicSize(rootTag: string): string {
  // Anchored on whitespace, not a word boundary: `stroke-width` ends in "width"
  // but says nothing about the drawing's size.
  if (/\s(width|height)\s*=/.test(rootTag)) return rootTag;

  const viewBox = /\bviewBox\s*=\s*"([^"]*)"/.exec(rootTag);
  if (!viewBox) return rootTag;

  const parts = viewBox[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return rootTag;
  }
  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return rootTag;

  return `${rootTag.slice(0, -1)} width="${width}" height="${height}">`;
}
