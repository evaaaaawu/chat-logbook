import { describe, it, expect } from "vitest";
import { svgWidgetCode, themeWidgetSvg } from "./visualize-widget.js";

describe("svgWidgetCode", () => {
  function widgetBlock(widgetCode: unknown) {
    return {
      type: "tool_use",
      id: "toolu_1",
      name: "mcp__visualize__show_widget",
      input: { title: "diagram", widget_code: widgetCode },
    };
  }

  it("accepts an SVG widget, leading whitespace and all", () => {
    expect(
      svgWidgetCode(widgetBlock('\n  <svg viewBox="0 0 680 100"></svg>'))
    ).toBe('\n  <svg viewBox="0 0 680 100"></svg>');
  });

  it("rejects an HTML widget, another tool, and a malformed call", () => {
    expect(svgWidgetCode(widgetBlock("<div>chart</div>"))).toBeNull();
    expect(svgWidgetCode(widgetBlock(undefined))).toBeNull();
    expect(
      svgWidgetCode({ type: "tool_use", id: "t", name: "Read", input: {} })
    ).toBeNull();
    expect(svgWidgetCode({ type: "text", text: "<svg>" })).toBeNull();
  });
});

describe("themeWidgetSvg", () => {
  const svg = '<svg viewBox="0 0 680 200"><text class="t">Hi</text></svg>';

  // Visualize SVGs carry no colors of their own — the harness supplies a
  // stylesheet keyed on class names. Served bare in an <img>, every text and
  // every node would fall back to SVG's default black.
  it("defines the text and ramp classes the widget's markup relies on", () => {
    const themed = themeWidgetSvg(svg);

    expect(themed).toContain("<style>");
    for (const cls of ["t", "ts", "th"]) {
      expect(themed).toMatch(new RegExp(`\\.${cls}\\s*[,{]`));
    }
    for (const ramp of [
      "c-gray",
      "c-blue",
      "c-red",
      "c-amber",
      "c-green",
      "c-teal",
      "c-purple",
      "c-coral",
      "c-pink",
    ]) {
      expect(themed).toContain(`.${ramp}`);
    }
  });

  it("injects the stylesheet inside the root element, keeping the markup intact", () => {
    const themed = themeWidgetSvg(svg);

    expect(themed.indexOf("<style>")).toBeGreaterThan(themed.indexOf("<svg"));
    expect(themed.indexOf("<style>")).toBeLessThan(themed.indexOf("<text"));
    expect(themed).toContain('<text class="t">Hi</text>');
    expect(themed.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("leaves a widget alone when it has no root element to inject into", () => {
    expect(themeWidgetSvg("not markup at all")).toBe("not markup at all");
  });

  // A visualize SVG declares only a viewBox. Served through `<img>` that leaves
  // it with no intrinsic size, and `width: auto` collapses the thumbnail to
  // nothing — it loads fine and renders 2px wide. jsdom does no layout, so only
  // a check on the served markup can hold this down.
  it("gives the root an intrinsic size taken from its viewBox", () => {
    const themed = themeWidgetSvg('<svg viewBox="0 0 780 440"><g/></svg>');

    expect(themed).toMatch(/<svg[^>]*\bwidth="780"/);
    expect(themed).toMatch(/<svg[^>]*\bheight="440"/);
  });

  it("keeps a size the widget declared for itself", () => {
    const themed = themeWidgetSvg(
      '<svg viewBox="0 0 780 440" width="100" height="50"><g/></svg>'
    );

    expect(themed).toContain('width="100"');
    expect(themed).toContain('height="50"');
    expect(themed).not.toContain('width="780"');
  });

  // `stroke-width` is a presentation attribute a widget may set on the root. It
  // is not a size, and mistaking it for one leaves the thumbnail collapsed.
  it("is not fooled by an attribute merely ending in width", () => {
    const themed = themeWidgetSvg(
      '<svg viewBox="0 0 780 440" stroke-width="2"><g/></svg>'
    );

    expect(themed).toMatch(/<svg[^>]*\swidth="780"/);
    expect(themed).toMatch(/<svg[^>]*\sheight="440"/);
  });

  it("leaves the root alone when the viewBox is missing or malformed", () => {
    expect(themeWidgetSvg("<svg><g/></svg>")).toContain("<svg><style>");
    expect(themeWidgetSvg('<svg viewBox="nonsense"><g/></svg>')).not.toContain(
      "width="
    );
  });
});
