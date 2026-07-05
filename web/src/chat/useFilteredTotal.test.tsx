import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { describe, it, expect } from "vitest";
import { useFilteredTotal } from "@/chat/useFilteredTotal";
import { server } from "@/test/server";

// Active fake chats: chat-1 + chat-3 (my-web-app), chat-2 (backend-api),
// chat-missing (some-project). Trashed: chat-deleted-1 + chat-deleted-2
// (both my-web-app).
describe("useFilteredTotal", () => {
  it("reads the server's post-filter total for an active Project filter", async () => {
    const { result } = renderHook(() =>
      useFilteredTotal("main", ["my-web-app"], [])
    );

    await waitFor(() => expect(result.current).toBe(2));
  });

  it("is undefined when no filter is active (header falls back to facet total)", async () => {
    const { result } = renderHook(() => useFilteredTotal("main", [], []));

    // Give any stray fetch a tick to resolve; the value must stay undefined.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeUndefined();
  });

  it("sends ?tagMode=any when the Any mode is active, and omits it for All", async () => {
    const urls: string[] = [];
    server.use(
      http.get("/api/chats/list-total", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ total: 0 });
      })
    );

    const { rerender } = renderHook(
      ({ mode }: { mode: "all" | "any" }) =>
        useFilteredTotal("main", [], ["bug"], mode),
      { initialProps: { mode: "all" as "all" | "any" } }
    );
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls.at(-1)).not.toContain("tagMode");

    rerender({ mode: "any" });
    await waitFor(() => expect(urls.at(-1)).toContain("tagMode=any"));
  });

  it("keeps the previous total while the next filter's total is in flight", async () => {
    const { result, rerender } = renderHook(
      ({ projects }) => useFilteredTotal("main", projects, []),
      { initialProps: { projects: ["my-web-app"] } }
    );
    await waitFor(() => expect(result.current).toBe(2));

    // Delay the next filter's response so we can observe the in-flight window.
    server.use(
      http.get("/api/chats/list-total", async () => {
        await delay(50);
        return HttpResponse.json({ total: 1 });
      })
    );
    rerender({ projects: ["backend-api"] });

    // Stale-while-revalidate: the header holds the last total (2) rather than
    // dropping to undefined — which would flash the paginated window count.
    expect(result.current).toBe(2);
    await waitFor(() => expect(result.current).toBe(1));
  });
});
