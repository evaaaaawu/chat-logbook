import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewMessagesPill } from "@/conversation/NewMessagesPill";

describe("NewMessagesPill", () => {
  it("shows a New messages control that fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<NewMessagesPill visible onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "New messages" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when not visible", () => {
    const { container } = render(
      <NewMessagesPill visible={false} onClick={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
