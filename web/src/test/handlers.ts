import { http, HttpResponse } from "msw";
import { MAX_PAGE_LIMIT } from "@contract";

type FakeChat = {
  id: string;
  sourceId: string;
  agent: string;
  defaultTitle: string;
  customTitle: string | null;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  isDeleted?: boolean;
};

const initialFakeChats: FakeChat[] = [
  {
    id: "chat-1",
    sourceId: "CHAT01",
    agent: "claude-code",
    defaultTitle: "Build a login page",
    customTitle: null,
    project: "my-web-app",
    projectPath: "/Users/test/my-web-app",
    sourceFilePath: "/Users/test/.claude/projects/my-web-app/chat-1.jsonl",
    createdAt: 1700000000000,
    updatedAt: 1700000200000,
  },
  {
    id: "chat-2",
    sourceId: "CHAT02",
    agent: "claude-code",
    defaultTitle: "Fix database migration",
    customTitle: null,
    project: "backend-api",
    projectPath: "/Users/test/backend-api",
    sourceFilePath: "/Users/test/.claude/projects/backend-api/chat-2.jsonl",
    createdAt: 1700000100000,
    updatedAt: 1700000300000,
  },
  {
    id: "chat-3",
    sourceId: "CHAT03",
    agent: "claude-code",
    defaultTitle: "Refactor utils",
    customTitle: null,
    project: "my-web-app",
    projectPath: "/Users/test/my-web-app",
    sourceFilePath: "/Users/test/.claude/projects/my-web-app/chat-3.jsonl",
    createdAt: 1700000050000,
    updatedAt: 1700000150000,
  },
  {
    id: "chat-missing",
    sourceId: "CHATMI",
    agent: "claude-code",
    defaultTitle: "Untitled",
    customTitle: null,
    project: "some-project",
    projectPath: "/Users/test/some-project",
    sourceFilePath: null,
    createdAt: 1699999900000,
    updatedAt: 1699999900000,
  },
  {
    id: "chat-deleted-1",
    sourceId: "CHATDE",
    agent: "claude-code",
    defaultTitle: "Old prototype",
    customTitle: null,
    project: "my-web-app",
    projectPath: "/Users/test/my-web-app",
    sourceFilePath:
      "/Users/test/.claude/projects/my-web-app/chat-deleted-1.jsonl",
    createdAt: 1699999000000,
    updatedAt: 1699999500000,
    deletedAt: 1700000200000,
    isDeleted: true,
  },
  {
    id: "chat-deleted-2",
    sourceId: "CHATD2",
    agent: "claude-code",
    defaultTitle: "Newer experiment",
    customTitle: null,
    project: "my-web-app",
    projectPath: "/Users/test/my-web-app",
    sourceFilePath:
      "/Users/test/.claude/projects/my-web-app/chat-deleted-2.jsonl",
    createdAt: 1699999100000,
    // Updated more recently than chat-deleted-1, but deleted earlier — so
    // sorting by Updated time vs Deleted time yields a different order.
    updatedAt: 1699999800000,
    deletedAt: 1700000100000,
    isDeleted: true,
  },
];

export let fakeChats: FakeChat[] = structuredClone(initialFakeChats);

type FakeTag = { id: string; name: string; color: string };

export let fakeTags: FakeTag[] = [];
// chatId -> ordered list of tag ids assigned to it.
export let fakeChatTags: Record<string, string[]> = {};

const PALETTE = [
  "yellow",
  "orange",
  "red",
  "magenta",
  "violet",
  "blue",
  "cyan",
  "green",
];

export function resetFakeChats(): void {
  fakeChats = structuredClone(initialFakeChats);
  fakeTags = [];
  fakeChatTags = {};
}

function tagsForChat(chatId: string): FakeTag[] {
  const ids = fakeChatTags[chatId] ?? [];
  return ids
    .map((id) => fakeTags.find((t) => t.id === id))
    .filter((t): t is FakeTag => t !== undefined);
}

export const fakeMessages = {
  "chat-1": [
    {
      role: "user",
      content: "Help me build a login page",
      timestamp: "2024-01-01T00:00:02Z",
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "Sure, I'll create a login page." }],
      timestamp: "2024-01-01T00:00:03Z",
    },
  ],
  "chat-2": [
    {
      role: "user",
      content: "Show me a **bold** example with a [link](https://example.com)",
      timestamp: "2024-01-01T00:00:04Z",
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Here is a code block:\n\n```js\nconsole.log('hello')\n```",
        },
      ],
      timestamp: "2024-01-01T00:00:05Z",
    },
  ],
  "chat-deleted-1": [
    {
      role: "user",
      content: "Quick prototype experiment",
      timestamp: "2024-01-01T00:00:08Z",
    },
  ],
  "chat-3": [
    {
      role: "user",
      content: "Refactor the utils module",
      timestamp: "2024-01-01T00:00:06Z",
    },
    {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "",
        },
        {
          type: "thinking",
          thinking:
            "I should read the current utils file first to understand the structure.",
        },
        {
          type: "tool_use",
          id: "tool-1",
          name: "Read",
          input: { file_path: "src/utils.ts" },
        },
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "export function add(a, b) { return a + b; }",
        },
        { type: "text", text: "I've read the file and will refactor it now." },
      ],
      timestamp: "2024-01-01T00:00:07Z",
    },
  ],
};

function projectChat(c: FakeChat) {
  const { defaultTitle, customTitle, ...rest } = c;
  return {
    ...rest,
    title: customTitle ?? defaultTitle,
    tags: tagsForChat(c.id),
  };
}

export const handlers = [
  http.get("/api/chats", ({ request }) => {
    const url = new URL(request.url);
    const includeTrashed = url.searchParams.get("includeTrashed") === "true";
    // The Trash view scopes the page to soft-deleted chats only (#145), distinct
    // from includeTrashed (active + trashed).
    const trashedOnly = url.searchParams.get("trashedOnly") === "true";
    const visible = trashedOnly
      ? fakeChats.filter((c) => c.isDeleted)
      : includeTrashed
        ? fakeChats
        : fakeChats.filter((c) => !c.isDeleted);

    // Paginated mode mirrors the merged backend (#142, #143): `?limit=` opts into
    // one server-sorted keyset page, with an opaque cursor and `nextCursor` (null
    // on the last page). `?direction=` (asc/desc, default desc) flips both the
    // sort and the keyset comparison in lock step. The cursor's wire shape is
    // opaque to the frontend; this fake uses base64 JSON of (sortKey,id) for
    // internal consistency, not byte-for-byte parity with the real encoder.
    const limitParam = url.searchParams.get("limit");
    if (limitParam !== null) {
      const limit = Number.parseInt(limitParam, 10);
      // Mirror the backend's keyset cap (the shared MAX_PAGE_LIMIT): a larger
      // limit is rejected, so the client must never request more than the cap.
      if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_PAGE_LIMIT) {
        return HttpResponse.json({ error: "Invalid limit" }, { status: 400 });
      }
      const sortParam = url.searchParams.get("sort");
      const sort =
        sortParam === "createdAt"
          ? "createdAt"
          : sortParam === "deletedAt"
            ? "deletedAt"
            : sortParam === "title"
              ? "title"
              : "updatedAt";
      const direction =
        url.searchParams.get("direction") === "asc" ? "asc" : "desc";
      const dir = direction === "asc" ? -1 : 1;
      // deletedAt is the Trash deleted-time axis (#145); a null deletedAt (an
      // active chat that slipped through) sorts as the oldest possible time.
      // title is the keyset Title axis (#146): the fake keys on the effective
      // title string (custom overrides default), a stand-in for the server's
      // precomputed collation key — enough for the client window to page.
      const sortKeyOf = (c: FakeChat): number | string =>
        sort === "createdAt"
          ? c.createdAt
          : sort === "deletedAt"
            ? (c.deletedAt ?? 0)
            : sort === "title"
              ? (c.customTitle ?? c.defaultTitle).toLowerCase()
              : c.updatedAt;
      // One comparison for both axes: string keys (title) and number keys (time).
      const cmpKey = (x: number | string, y: number | string): number =>
        x < y ? -1 : x > y ? 1 : 0;
      // Project (OR) + Tag (AND) filtering inside the paginated query, mirroring
      // the server (#130). Repeated `?project=` unions; `?tags=` is one
      // comma-separated AND set. An empty value selects the (No project) /
      // Untagged group. Absent params leave that axis unfiltered.
      const projectSel = url.searchParams.getAll("project");
      const tagsParam = url.searchParams.get("tags");
      const tagSel = tagsParam === null ? null : tagsParam.split(",");
      const filtered = visible.filter((c) => {
        if (projectSel.length > 0 && !projectSel.includes(c.project)) {
          return false;
        }
        if (tagSel) {
          const ids = new Set(fakeChatTags[c.id] ?? []);
          const wantUntagged = tagSel.includes("");
          if (wantUntagged && ids.size > 0) return false;
          if (!tagSel.filter((t) => t !== "").every((t) => ids.has(t))) {
            return false;
          }
        }
        return true;
      });
      // dir flips the sort and the tiebreak together: desc is (sortKey DESC, id
      // DESC), asc is (sortKey ASC, id ASC).
      const sorted = [...filtered].sort(
        (a, b) =>
          dir * cmpKey(sortKeyOf(b), sortKeyOf(a)) ||
          dir * (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
      );
      const cursorParam = url.searchParams.get("cursor");
      let start = 0;
      if (cursorParam) {
        const cur = JSON.parse(
          Buffer.from(cursorParam, "base64url").toString("utf8")
        ) as { sortKey: number | string; id: string };
        const after = sorted.findIndex((c) => {
          const k = cmpKey(sortKeyOf(c), cur.sortKey);
          return direction === "asc"
            ? k > 0 || (k === 0 && c.id > cur.id)
            : k < 0 || (k === 0 && c.id < cur.id);
        });
        start = after < 0 ? sorted.length : after;
      }
      const pageItems = sorted.slice(start, start + limit);
      const hasMore = start + limit < sorted.length;
      const last = pageItems[pageItems.length - 1];
      const nextCursor =
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ sortKey: sortKeyOf(last), id: last.id }),
              "utf8"
            ).toString("base64url")
          : null;
      return HttpResponse.json({
        chats: pageItems.map(projectChat),
        nextCursor,
      });
    }

    return HttpResponse.json({ chats: visible.map(projectChat) });
  }),
  // Server-side facet + list counts (#131 Phase A). Static per view: counts the
  // view's whole universe (main vs Trash) and does not change with a selected
  // filter. Registered before `/api/chats/:id` so `counts` is not read as an id.
  http.get("/api/chats/counts", ({ request }) => {
    const url = new URL(request.url);
    const includeTrashed = url.searchParams.get("includeTrashed") === "true";
    const inView = includeTrashed
      ? fakeChats.filter((c) => c.isDeleted)
      : fakeChats.filter((c) => !c.isDeleted);

    const projMap = new Map<string, { count: number; lastActiveAt: number }>();
    const tagMap = new Map<string, number>();
    let untagged = 0;
    for (const c of inView) {
      const prev = projMap.get(c.project) ?? { count: 0, lastActiveAt: 0 };
      projMap.set(c.project, {
        count: prev.count + 1,
        lastActiveAt: Math.max(prev.lastActiveAt, c.updatedAt),
      });
      const ids = fakeChatTags[c.id] ?? [];
      if (ids.length === 0) untagged += 1;
      for (const id of ids) tagMap.set(id, (tagMap.get(id) ?? 0) + 1);
    }

    return HttpResponse.json({
      total: inView.length,
      projects: [...projMap.entries()].map(([project, v]) => ({
        project,
        count: v.count,
        lastActiveAt: v.lastActiveAt,
      })),
      tags: [...tagMap.entries()].map(([tagId, count]) => ({ tagId, count })),
      untagged,
    });
  }),
  // Filtered List count (#131 Phase B): the post-filter total for the active
  // Project (OR) / Tag (AND) / Untagged filter, scoped to the view. Mirrors the
  // paginated query's filter parsing so the header total matches the listed set.
  http.get("/api/chats/list-total", ({ request }) => {
    const url = new URL(request.url);
    const includeTrashed = url.searchParams.get("includeTrashed") === "true";
    const inView = includeTrashed
      ? fakeChats.filter((c) => c.isDeleted)
      : fakeChats.filter((c) => !c.isDeleted);

    const projectSel = url.searchParams.getAll("project");
    const tagsParam = url.searchParams.get("tags");
    const tagSel = tagsParam === null ? null : tagsParam.split(",");
    const total = inView.filter((c) => {
      if (projectSel.length > 0 && !projectSel.includes(c.project)) {
        return false;
      }
      if (tagSel) {
        const ids = new Set(fakeChatTags[c.id] ?? []);
        const wantUntagged = tagSel.includes("");
        if (wantUntagged && ids.size > 0) return false;
        if (!tagSel.filter((t) => t !== "").every((t) => ids.has(t))) {
          return false;
        }
      }
      return true;
    }).length;

    return HttpResponse.json({ total });
  }),
  http.patch("/api/chats/:id/title", async ({ params, request }) => {
    const id = params.id as string;
    const chat = fakeChats.find((c) => c.id === id);
    if (!chat) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const body = (await request.json()) as { title?: unknown };
    if (typeof body?.title !== "string") {
      return HttpResponse.json({ error: "Invalid title" }, { status: 400 });
    }
    if (body.title.length > 200) {
      return HttpResponse.json({ error: "Title too long" }, { status: 400 });
    }
    const trimmed = body.title.trim();
    chat.customTitle = trimmed.length > 0 ? trimmed : null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/chats/:id", ({ params }) => {
    const id = params.id as string;
    const messages = fakeMessages[id as keyof typeof fakeMessages];
    if (!messages) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return HttpResponse.json({ messages });
  }),
  http.delete("/api/chats/:id", ({ params }) => {
    const id = params.id as string;
    const chat = fakeChats.find((c) => c.id === id);
    if (!chat) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    chat.isDeleted = true;
    chat.deletedAt = Date.now();
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/chats/:id/restore", ({ params }) => {
    const id = params.id as string;
    const chat = fakeChats.find((c) => c.id === id);
    if (!chat) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    chat.isDeleted = false;
    chat.deletedAt = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/tags", () => {
    return HttpResponse.json({ tags: fakeTags });
  }),
  http.post("/api/tags", async ({ request }) => {
    const body = (await request.json()) as { name?: unknown; color?: unknown };
    if (typeof body?.name !== "string" || body.name.trim().length === 0) {
      return HttpResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (typeof body?.color !== "string" || !PALETTE.includes(body.color)) {
      return HttpResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    const tag: FakeTag = {
      id: `tag-${fakeTags.length + 1}-${body.name.trim()}`,
      name: body.name.trim(),
      color: body.color,
    };
    fakeTags = [...fakeTags, tag];
    return HttpResponse.json({ tag }, { status: 201 });
  }),
  http.patch("/api/tags/:id", async ({ params, request }) => {
    const id = params.id as string;
    const tag = fakeTags.find((t) => t.id === id);
    if (!tag) {
      return HttpResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    const body = (await request.json()) as { name?: unknown; color?: unknown };
    if (typeof body?.name === "string" && body.name.trim().length > 0) {
      tag.name = body.name.trim();
    }
    if (typeof body?.color === "string") {
      if (!PALETTE.includes(body.color)) {
        return HttpResponse.json({ error: "Invalid color" }, { status: 400 });
      }
      tag.color = body.color;
    }
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete("/api/tags/:id", ({ params }) => {
    const id = params.id as string;
    const exists = fakeTags.some((t) => t.id === id);
    if (!exists) {
      return HttpResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    let removedFromChats = 0;
    for (const [chatId, ids] of Object.entries(fakeChatTags)) {
      if (ids.includes(id)) {
        removedFromChats += 1;
        fakeChatTags[chatId] = ids.filter((t) => t !== id);
      }
    }
    fakeTags = fakeTags.filter((t) => t.id !== id);
    return HttpResponse.json({ removedFromChats });
  }),
  http.post("/api/chats/:id/tags", async ({ params, request }) => {
    const chatId = params.id as string;
    const chat = fakeChats.find((c) => c.id === chatId);
    if (!chat) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const body = (await request.json()) as { tagId?: unknown };
    if (
      typeof body?.tagId !== "string" ||
      !fakeTags.some((t) => t.id === body.tagId)
    ) {
      return HttpResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    const current = fakeChatTags[chatId] ?? [];
    if (!current.includes(body.tagId)) {
      fakeChatTags[chatId] = [...current, body.tagId];
    }
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete("/api/chats/:id/tags/:tagId", ({ params }) => {
    const chatId = params.id as string;
    const tagId = params.tagId as string;
    const chat = fakeChats.find((c) => c.id === chatId);
    if (!chat) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    fakeChatTags[chatId] = (fakeChatTags[chatId] ?? []).filter(
      (t) => t !== tagId
    );
    return new HttpResponse(null, { status: 204 });
  }),
];
