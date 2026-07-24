import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JsonView } from "./JsonView";

describe("JsonView", () => {
  it("pretty-prints the value, one line per key", () => {
    render(<JsonView value={{ pattern: "useState", path: "web/src" }} />);

    const rows = screen.getAllByTestId("json-line");
    expect(rows).toHaveLength(4);
    expect(rows[1].textContent).toBe('  "pattern": "useState",');
    expect(rows[2].textContent).toBe('  "path": "web/src"');
  });

  it("colours it as JSON, with keys told apart from their values", async () => {
    const { container } = render(<JsonView value={{ pattern: "useState" }} />);

    await waitFor(() =>
      expect(container.querySelector(".hljs-attr")).not.toBeNull()
    );
    expect(container.querySelector(".hljs-attr")?.textContent).toBe(
      '"pattern"'
    );
    expect(container.querySelector(".hljs-string")?.textContent).toBe(
      '"useState"'
    );
  });

  it("stops colouring past the cap, so the rest still renders", async () => {
    const { container } = render(
      <JsonView value={{ a: "one", b: "two", c: "three" }} highlightCap={2} />
    );

    await waitFor(() =>
      expect(container.querySelectorAll(".hljs-attr")).toHaveLength(1)
    );
    const rows = screen.getAllByTestId("json-line");
    expect(rows[3].textContent).toBe('  "c": "three"');
    expect(rows[3].querySelector("[class^='hljs-']")).toBeNull();
  });
});
