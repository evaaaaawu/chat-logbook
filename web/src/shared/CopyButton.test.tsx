import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/shared/CopyButton";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

describe("CopyButton", () => {
  it("puts its value on the clipboard when clicked", async () => {
    render(<CopyButton value="const x = 1;" label="Copy code" />);

    await userEvent.click(screen.getByRole("button", { name: "Copy code" }));

    expect(writeText).toHaveBeenCalledWith("const x = 1;");
  });

  it("confirms the copy, then settles back to offering it again", async () => {
    vi.useFakeTimers();
    render(<CopyButton value="anything" label="Copy code" />);

    // fireEvent, not userEvent: userEvent awaits its own internal delays, which
    // never resolve while the clock is frozen.
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByRole("button", { name: "Copy code" })
    ).toBeInTheDocument();

    vi.useRealTimers();
  });
});
