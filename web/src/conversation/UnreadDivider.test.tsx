import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnreadDivider } from "@/conversation/UnreadDivider";

describe("UnreadDivider", () => {
  it("renders a labelled separator marking where unread messages begin", () => {
    render(<UnreadDivider />);

    const divider = screen.getByRole("separator", { name: "New messages" });
    expect(divider).not.toBeNull();
  });
});
