import { describe, it, expect } from "vitest";
import { createListEventHub } from "./list-events.js";

describe("createListEventHub", () => {
  it("delivers a published event to a subscriber", () => {
    const hub = createListEventHub();
    const received: Array<{ type: string }> = [];
    hub.subscribe((event) => received.push(event));

    hub.publish({ type: "changed" });

    expect(received).toEqual([{ type: "changed" }]);
  });

  it("stops delivering after a subscriber unsubscribes", () => {
    const hub = createListEventHub();
    const received: Array<{ type: string }> = [];
    const unsubscribe = hub.subscribe((event) => received.push(event));

    hub.publish({ type: "changed" });
    unsubscribe();
    hub.publish({ type: "changed" });

    expect(received).toEqual([{ type: "changed" }]);
  });
});
