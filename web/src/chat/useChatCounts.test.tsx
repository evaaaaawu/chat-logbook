import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useChatCounts } from "@/chat/useChatCounts";

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
});
