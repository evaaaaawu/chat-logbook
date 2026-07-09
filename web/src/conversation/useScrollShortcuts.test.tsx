import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useScrollShortcuts } from "@/conversation/useScrollShortcuts";

function Harness(props: {
  enabled: boolean;
  onJumpTop: () => void;
  onJumpBottom: () => void;
}) {
  useScrollShortcuts(props);
  return <input data-testid="field" />;
}

function setup(overrides?: Partial<Parameters<typeof Harness>[0]>) {
  const onJumpTop = vi.fn();
  const onJumpBottom = vi.fn();
  render(
    <Harness
      enabled={true}
      onJumpTop={onJumpTop}
      onJumpBottom={onJumpBottom}
      {...overrides}
    />
  );
  return { onJumpTop, onJumpBottom };
}

describe("useScrollShortcuts", () => {
  it("jumps to the bottom on Cmd/Ctrl+ArrowDown", () => {
    const { onJumpBottom } = setup();

    fireEvent.keyDown(document.body, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowDown", ctrlKey: true });

    expect(onJumpBottom).toHaveBeenCalledTimes(2);
  });

  it("jumps to the top on Cmd/Ctrl+ArrowUp", () => {
    const { onJumpTop } = setup();

    fireEvent.keyDown(document.body, { key: "ArrowUp", metaKey: true });

    expect(onJumpTop).toHaveBeenCalledTimes(1);
  });

  it("maps End to the bottom and Home to the top", () => {
    const { onJumpTop, onJumpBottom } = setup();

    fireEvent.keyDown(document.body, { key: "End" });
    fireEvent.keyDown(document.body, { key: "Home" });

    expect(onJumpBottom).toHaveBeenCalledTimes(1);
    expect(onJumpTop).toHaveBeenCalledTimes(1);
  });

  it("leaves a bare ArrowDown to the list cursor (no modifier)", () => {
    const { onJumpBottom } = setup();

    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(onJumpBottom).not.toHaveBeenCalled();
  });

  it("ignores the keys while typing in a field", () => {
    const { onJumpTop, onJumpBottom } = setup();
    const field = screen.getByTestId("field");
    field.focus();

    fireEvent.keyDown(field, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(field, { key: "Home" });

    expect(onJumpBottom).not.toHaveBeenCalled();
    expect(onJumpTop).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { onJumpTop, onJumpBottom } = setup({ enabled: false });

    fireEvent.keyDown(document.body, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(document.body, { key: "End" });

    expect(onJumpBottom).not.toHaveBeenCalled();
    expect(onJumpTop).not.toHaveBeenCalled();
  });
});
