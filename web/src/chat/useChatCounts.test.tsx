import { act, renderHook, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, it, expect } from "vitest";
import { useChatCounts } from "@/chat/useChatCounts";
import { server } from "@/test/server";

// Active fake chats: chat-1 + chat-3 (my-web-app), chat-2 (backend-api),
// chat-missing (some-project). Trashed: chat-deleted-1 + chat-deleted-2
// (both my-web-app).
describe("useChatCounts", () => {
  it("reads the main view's server counts (total + per-project facets)", async () => {
    const { result } = renderHook(() => useChatCounts("main"));

    await waitFor(() => expect(result.current.counts.total).toBe(4));

    const byProject = new Map(
      result.current.counts.projects.map((p) => [p.project, p.count])
    );
    expect(byProject.get("my-web-app")).toBe(2);
    expect(byProject.get("backend-api")).toBe(1);
    // No tags assigned by default, so every active chat is untagged.
    expect(result.current.counts.untagged).toBe(4);
  });

  it("reads the Trash view's counts when mode is trash", async () => {
    const { result } = renderHook(() => useChatCounts("trash"));

    await waitFor(() => expect(result.current.counts.total).toBe(2));

    const byProject = new Map(
      result.current.counts.projects.map((p) => [p.project, p.count])
    );
    expect(byProject.get("my-web-app")).toBe(2);
  });

  it("ignores a response for the view the reader has already left", async () => {
    // The main read is slow, the Trash read is instant, so switching views
    // mid-flight lands the responses out of order. Trash's counts must stand.
    const MAIN_READ_MS = 50;
    server.use(
      http.get("/api/chats/counts", async ({ request }) => {
        const trashed =
          new URL(request.url).searchParams.get("includeTrashed") === "true";
        if (trashed) {
          return HttpResponse.json({
            total: 2,
            projects: [{ project: "my-web-app", count: 2, lastActiveAt: 0 }],
            tags: [],
            untagged: 2,
          });
        }
        await delay(MAIN_READ_MS);
        return HttpResponse.json({
          total: 4,
          projects: [{ project: "my-web-app", count: 2, lastActiveAt: 0 }],
          tags: [],
          untagged: 4,
        });
      })
    );

    const { result, rerender } = renderHook(
      ({ mode }: { mode: "main" | "trash" }) => useChatCounts(mode),
      { initialProps: { mode: "main" as "main" | "trash" } }
    );
    rerender({ mode: "trash" });

    await waitFor(() => expect(result.current.counts.total).toBe(2));

    // Outlast the main read, then check it did not overwrite what Trash wrote.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, MAIN_READ_MS * 3));
    });
    expect(result.current.counts.total).toBe(2);
    expect(result.current.counts.untagged).toBe(2);
  });
});
