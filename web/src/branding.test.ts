import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const faviconSvg = readFileSync(
  resolve(process.cwd(), "public/favicon.svg"),
  "utf8"
);

describe("branding — tab title", () => {
  it("titles the document Chat Logbook, not the Vite scaffold's web", () => {
    expect(indexHtml).toMatch(/<title>Chat Logbook<\/title>/);
    expect(indexHtml).not.toMatch(/<title>web<\/title>/);
  });
});

describe("branding — favicon links", () => {
  it("links a PNG fallback after the SVG icon (Safari has no SVG favicon)", () => {
    const svgLink = indexHtml.search(
      /<link[^>]+rel="icon"[^>]+type="image\/svg\+xml"/
    );
    const pngLink = indexHtml.search(
      /<link[^>]+rel="icon"[^>]+type="image\/png"/
    );

    expect(svgLink).toBeGreaterThanOrEqual(0);
    expect(pngLink).toBeGreaterThanOrEqual(0);
    expect(pngLink).toBeGreaterThan(svgLink);
  });
});

describe("branding — favicon mark", () => {
  it("is the logbook notebook mark (cream on teal), not the Vite bolt", () => {
    // The app's --primary teal tile and Solarized base3 cream notebook.
    expect(faviconSvg.toLowerCase()).toContain("#2aa198");
    expect(faviconSvg.toLowerCase()).toContain("#fdf6e3");
    // The scaffold bolt's purple must be gone.
    expect(faviconSvg.toLowerCase()).not.toContain("#863bff");
  });
});
