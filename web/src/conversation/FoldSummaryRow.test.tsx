import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FoldSummaryRow } from "./FoldSummaryRow";

describe("FoldSummaryRow", () => {
  it("accents its chevron while folded — the cue that the Run opens", () => {
    render(
      <FoldSummaryRow
        summary="12 tool calls"
        isExpanded={false}
        onToggle={() => {}}
      />
    );

    // The bare accent, not the hover-only group-hover:text-primary of a plain
    // collapsible row — the fold summary wears the colour while merely folded.
    const chevron = screen.getByTestId("row-chevron");
    expect(chevron.getAttribute("class")).toMatch(/(?<!hover:)text-primary/);
  });
});
