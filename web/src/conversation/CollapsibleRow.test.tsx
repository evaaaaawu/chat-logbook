import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Layers } from "lucide-react";
import { CollapsibleRow } from "./CollapsibleRow";

describe("CollapsibleRow chevron treatment", () => {
  it("accents the chevron on a folded summary row", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="12 tool calls"
        isExpanded={false}
        onToggle={() => {}}
        isExpandable
        isSummary
      />
    );

    // The bare accent, not the hover-only group-hover:text-primary.
    const chevron = screen.getByTestId("row-chevron");
    expect(chevron.getAttribute("class")).toMatch(/(?<!hover:)text-primary/);
  });

  it("keeps a collapsed individual row muted, accenting only on hover", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="Read a.tsx"
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const chevron = screen.getByTestId("row-chevron");
    const cls = chevron.getAttribute("class") ?? "";
    expect(cls).not.toMatch(/(?<!hover:)text-primary/);
    expect(cls).toMatch(/group-hover:text-primary/);
  });

  it("mutes the chevron on an expanded summary row", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="12 tool calls"
        isExpanded
        onToggle={() => {}}
        isExpandable
        isSummary
      />
    );

    const cls = screen.getByTestId("row-chevron").getAttribute("class") ?? "";
    expect(cls).not.toMatch(/text-primary/);
  });

  it("mutes an expanded individual row, dropping the hover accent too", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="Read a.tsx"
        isExpanded
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const cls = screen.getByTestId("row-chevron").getAttribute("class") ?? "";
    expect(cls).not.toMatch(/text-primary/);
  });

  it("leaves the error dot its own colour under the accent rules", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="Bash"
        hasError
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const dot = screen.getByTestId("row-error");
    expect(dot.getAttribute("class") ?? "").toMatch(/bg-destructive/);
  });
});
