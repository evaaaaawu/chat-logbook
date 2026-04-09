import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
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
Element.prototype.getBoundingClientRect = function () {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 100,
    right: 800,
    width: 800,
    height: 100,
    toJSON() {
      return this;
    },
  };
};

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
