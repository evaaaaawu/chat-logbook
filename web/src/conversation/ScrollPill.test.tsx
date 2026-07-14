import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScrollPill } from "@/conversation/ScrollPill";

describe("ScrollPill", () => {
  it("renders a jump-to-bottom control that fires onJumpBottom", async () => {
    const user = userEvent.setup();
    const onJumpBottom = vi.fn();

    render(
      <ScrollPill
        target="bottom"
        onJumpTop={vi.fn()}
        onJumpBottom={onJumpBottom}
      />
    );

    await user.click(screen.getByRole("button", { name: "Jump to bottom" }));

    expect(onJumpBottom).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Jump to top" })).toBeNull();
  });

  it("renders a jump-to-top control that fires onJumpTop", async () => {
    const user = userEvent.setup();
    const onJumpTop = vi.fn();

    render(
      <ScrollPill target="top" onJumpTop={onJumpTop} onJumpBottom={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Jump to top" }));

    expect(onJumpTop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Jump to bottom" })).toBeNull();
  });

  it("renders nothing when there is no target", () => {
    const { container } = render(
      <ScrollPill target={null} onJumpTop={vi.fn()} onJumpBottom={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
