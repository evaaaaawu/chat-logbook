import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { CommandView } from "./CommandView";

describe("CommandView", () => {
  it("caps long output and reveals the rest on request", async () => {
    const output = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join(
      "\n"
    );

    render(<CommandView command="pnpm test" output={output} lineCap={40} />);

    expect(screen.getAllByTestId("output-line")).toHaveLength(40);
    expect(screen.queryByText("line 60")).toBeNull();

    await userEvent.click(screen.getByText("Show 20 more lines"));

    expect(screen.getAllByTestId("output-line")).toHaveLength(60);
    expect(screen.getByText("line 60")).not.toBeNull();
    expect(screen.queryByText(/Show \d+ more/)).toBeNull();
  });
});
