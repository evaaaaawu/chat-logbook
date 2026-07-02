import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetFakeChats } from "./handlers";
import { server } from "./server";

// react-resizable-panels and @tanstack/react-virtual require ResizeObserver.
// The virtualizer needs ResizeObserver to fire so it knows the scroll container's size.
globalThis.ResizeObserver = class ResizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const rect = target.getBoundingClientRect();
    const boxSize = [{ inlineSize: rect.width, blockSize: rect.height }];
    // Fire the callback asynchronously so the virtualizer sees a non-zero rect
    setTimeout(() => {
      this.callback(
        [
          {
            target,
            contentRect: rect,
            contentBoxSize: boxSize,
            borderBoxSize: boxSize,
            devicePixelContentBoxSize: boxSize,
          } as unknown as ResizeObserverEntry,
        ],
        this
      );
    }, 0);
  }
  unobserve() {}
  disconnect() {}
};

// @tanstack/react-virtual uses getBoundingClientRect to measure elements.
// jsdom returns all zeros, so the virtualizer renders nothing.
// Provide a default height so virtual items are visible in tests.
//
// Scroll viewports are tall in a real browser, so the virtualizer renders many
// rows at once. jsdom collapses everything to one height, so we restore a tall
// height for the scroll containers (chat list, conversation) while keeping
// individual rows short — otherwise a single 100px viewport would window the
// list down to ~2 rows and break order assertions that read the full list.
const SCROLL_CONTAINER_TESTIDS = new Set(["chat-scroll", "conversation-panel"]);
Element.prototype.getBoundingClientRect = function () {
  const height = SCROLL_CONTAINER_TESTIDS.has(
    this.getAttribute("data-testid") ?? ""
  )
    ? 1000
    : 100;
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: 800,
    width: 800,
    height,
    toJSON() {
      return this;
    },
  };
};

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetFakeChats();
  localStorage.clear();
});
afterAll(() => server.close());
