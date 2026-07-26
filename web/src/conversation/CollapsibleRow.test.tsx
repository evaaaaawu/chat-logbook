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

describe("CollapsibleRow diff stat", () => {
  const LONG_PATH = "Edited web/src/conversation/CollapsibleToolCall.tsx";

  it("keeps the counts out of the truncating label, at the row's trailing edge", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary={LONG_PATH}
        diffStat={{ added: 39, removed: 2 }}
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const stat = screen.getByTestId("row-diff-stat");
    expect(stat.textContent).toBe("+39 -2");
    // Whatever the path does, the stat is not inside what truncates it.
    expect(stat.closest(".truncate")).toBeNull();
    expect(stat.getAttribute("class") ?? "").toMatch(/shrink-0/);
  });

  it("keeps each side's sign attached, so colour is never the only cue", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary={LONG_PATH}
        diffStat={{ added: 39, removed: 2 }}
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const added = screen.getByTestId("row-diff-added");
    const removed = screen.getByTestId("row-diff-removed");
    expect(added.textContent).toBe("+39");
    expect(removed.textContent).toBe("-2");
    expect(added.getAttribute("class") ?? "").toMatch(/diff-add/);
    expect(removed.getAttribute("class") ?? "").toMatch(/diff-remove/);
  });

  it("dims a zero side rather than dropping it, keeping the row's shape", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="Wrote README.md"
        diffStat={{ added: 12, removed: 0 }}
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    expect(screen.getByTestId("row-diff-stat").textContent).toBe("+12 -0");
    expect(
      screen.getByTestId("row-diff-removed").getAttribute("class")
    ).toMatch(/opacity-50/);
    expect(
      screen.getByTestId("row-diff-added").getAttribute("class")
    ).not.toMatch(/opacity-50/);
  });

  it("rests near the muted label, resolving to full colour on hover", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary={LONG_PATH}
        diffStat={{ added: 39, removed: 2 }}
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const added =
      screen.getByTestId("row-diff-added").getAttribute("class") ?? "";
    const removed =
      screen.getByTestId("row-diff-removed").getAttribute("class") ?? "";
    expect(added).toMatch(/(?<!hover:)text-diff-add-muted/);
    expect(removed).toMatch(/(?<!hover:)text-diff-remove-muted/);
    expect(added).toMatch(/group-hover:text-diff-add(?!-muted)/);
    expect(removed).toMatch(/group-hover:text-diff-remove(?!-muted)/);
  });

  it("wears the diff's own colours once the row is open", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary={LONG_PATH}
        diffStat={{ added: 39, removed: 2 }}
        isExpanded
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    const added =
      screen.getByTestId("row-diff-added").getAttribute("class") ?? "";
    const removed =
      screen.getByTestId("row-diff-removed").getAttribute("class") ?? "";
    expect(added).toMatch(/(?<!hover:)text-diff-add(?!-muted)/);
    expect(removed).toMatch(/(?<!hover:)text-diff-remove(?!-muted)/);
    expect(added).not.toMatch(/-muted/);
    expect(removed).not.toMatch(/-muted/);
  });

  it("leaves a row that carries no stat alone", () => {
    render(
      <CollapsibleRow
        icon={Layers}
        summary="Bash: pnpm test"
        isExpanded={false}
        onToggle={() => {}}
      >
        <div>detail</div>
      </CollapsibleRow>
    );

    expect(screen.queryByTestId("row-diff-stat")).toBeNull();
  });
});
