import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, it, expect } from "vitest";
import { usePaginatedChats } from "@/chat/usePaginatedChats";
import { fakeChats } from "@/test/handlers";
import { server } from "@/test/server";

// Active fake chats by updatedAt desc: chat-2 (300), chat-1 (200), chat-3 (150),
// chat-missing (1699999900000). Deleted chats are excluded from the active list.
describe("usePaginatedChats", () => {
  it("loads the first page sorted by updatedAt descending", async () => {
    const { result } = renderHook(() =>
      usePaginatedChats("updatedAt", "desc", { pageSize: 2 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chats.map((c) => c.id)).toEqual(["chat-2", "chat-1"]);
    expect(result.current.hasMore).toBe(true);
  });

  it("loads the first page sorted by createdAt descending", async () => {
    // Active by createdAt desc: chat-2 (1700000100000), chat-3 (1700000050000),
    // chat-1 (1700000000000), chat-missing (1699999900000).
    const { result } = renderHook(() =>
      usePaginatedChats("createdAt", "desc", { pageSize: 2 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chats.map((c) => c.id)).toEqual(["chat-2", "chat-3"]);
  });

  it("loads the first page sorted by createdAt ascending", async () => {
    // Active by createdAt asc: chat-missing (1699999900000), chat-1
    // (1700000000000), chat-3 (1700000050000), chat-2 (1700000100000).
    const { result } = renderHook(() =>
      usePaginatedChats("createdAt", "asc", { pageSize: 2 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chats.map((c) => c.id)).toEqual([
      "chat-missing",
      "chat-1",
    ]);
    expect(result.current.hasMore).toBe(true);
  });

  it("fetches the next page by cursor and appends it below the window", async () => {
    const { result } = renderHook(() =>
      usePaginatedChats("updatedAt", "desc", { pageSize: 2 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chats.map((c) => c.id)).toEqual(["chat-2", "chat-1"]);

    act(() => result.current.loadMore());

    await waitFor(() =>
      expect(result.current.chats.map((c) => c.id)).toEqual([
        "chat-2",
        "chat-1",
        "chat-3",
        "chat-missing",
      ])
    );
    // All four active chats are loaded; no further page remains.
    expect(result.current.hasMore).toBe(false);
  });

  it("does not fetch more once the last page is reached", async () => {
    // A page large enough to hold every active chat: first page is the last.
    const { result } = renderHook(() =>
      usePaginatedChats("updatedAt", "desc", { pageSize: 50 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);
    const before = result.current.chats.map((c) => c.id);

    act(() => result.current.loadMore());

    // No cursor means no request; the window is unchanged.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chats.map((c) => c.id)).toEqual(before);
  });

  it("merges field updates and brand-new chats on a background refresh without dropping loaded rows", async () => {
    const { result } = renderHook(() =>
      usePaginatedChats("updatedAt", "desc", { pageSize: 2 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chats.map((c) => c.id)).toEqual(["chat-2", "chat-1"]);

    // Background ingestion: bump a loaded row and surface a brand-new chat that
    // now ranks at the very top by updatedAt.
    const loaded = fakeChats.find((c) => c.id === "chat-1")!;
    loaded.updatedAt = 1700000400000;
    fakeChats.push({
      id: "chat-new",
      sourceId: "CHATNW",
      agent: "claude-code",
      defaultTitle: "Fresh chat",
      customTitle: null,
      project: "my-web-app",
      projectPath: "/Users/test/my-web-app",
      sourceFilePath: null,
      createdAt: 1700000500000,
      updatedAt: 1700000500000,
    });

    await act(async () => {
      await result.current.refresh();
    });

    const byId = new Map(result.current.chats.map((c) => [c.id, c]));
    // The brand-new chat is surfaced; the previously-loaded rows are retained
    // (chat-1 is absent from the refetched top-2 but must not vanish).
    expect(byId.has("chat-new")).toBe(true);
    expect(byId.has("chat-1")).toBe(true);
    expect(byId.has("chat-2")).toBe(true);
    // The retained row carries its refreshed field value.
    expect(byId.get("chat-1")!.updatedAt).toBe(1700000400000);
  });

  it("sends the active Project filter to the server (#130)", async () => {
    // Active by updatedAt desc: chat-2 (backend-api), chat-1 (my-web-app),
    // chat-3 (my-web-app), chat-missing (some-project). Filtering to my-web-app
    // server-side leaves only chat-1 and chat-3.
    const { result } = renderHook(() =>
      usePaginatedChats("updatedAt", "desc", {
        pageSize: 10,
        projects: ["my-web-app"],
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chats.map((c) => c.id)).toEqual(["chat-1", "chat-3"]);
  });

  it("re-anchors the window when the active filter changes (#130)", async () => {
    const { result, rerender } = renderHook(
      ({ projects }: { projects: string[] }) =>
        usePaginatedChats("updatedAt", "desc", { pageSize: 10, projects }),
      { initialProps: { projects: ["my-web-app"] } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chats.map((c) => c.id)).toEqual(["chat-1", "chat-3"]);

    // Changing the selection re-anchors: the window refetches the first page for
    // the new filter rather than appending to or keeping the old one.
    rerender({ projects: ["backend-api"] });

    await waitFor(() =>
      expect(result.current.chats.map((c) => c.id)).toEqual(["chat-2"])
    );
  });

  it("ignores a failed background refresh instead of crashing", async () => {
    const { result } = renderHook(() =>
      usePaginatedChats("updatedAt", "desc", { pageSize: 2 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.chats.map((c) => c.id);

    // The next list read fails (e.g. once the loaded window grows past the cap,
    // a window-sized limit is rejected with 400 — the bug that blanked the app).
    server.use(
      http.get("/api/chats", () =>
        HttpResponse.json({ error: "Invalid limit" }, { status: 400 })
      )
    );

    await act(async () => {
      await result.current.refresh();
    });

    // Refresh is a no-op on failure; the window stays intact, nothing throws.
    expect(result.current.chats.map((c) => c.id)).toEqual(before);
  });
});
