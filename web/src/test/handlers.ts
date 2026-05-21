import { http, HttpResponse } from "msw";

type FakeChat = {
  id: string;
  chatId: string;
  agent: string;
  defaultTitle: string;
  customTitle: string | null;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
};

const initialFakeChats: FakeChat[] = [
  {
    id: "chat-1",
    chatId: "CHAT01",
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
    chatId: "CHAT02",
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
    chatId: "CHAT03",
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
    chatId: "CHATMI",
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
    chatId: "CHATDE",
    agent: "claude-code",
    defaultTitle: "Old prototype",
    customTitle: null,
    project: "my-web-app",
    projectPath: "/Users/test/my-web-app",
    sourceFilePath:
      "/Users/test/.claude/projects/my-web-app/chat-deleted-1.jsonl",
    createdAt: 1699999000000,
    updatedAt: 1699999500000,
    isDeleted: true,
  },
];

export let fakeChats: FakeChat[] = structuredClone(initialFakeChats);

export function resetFakeChats(): void {
  fakeChats = structuredClone(initialFakeChats);
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
  return { ...rest, title: customTitle ?? defaultTitle };
}

export const handlers = [
  http.get("/api/chats", ({ request }) => {
    const url = new URL(request.url);
    const includeTrashed = url.searchParams.get("includeTrashed") === "true";
    const filtered = includeTrashed
      ? fakeChats
      : fakeChats.filter((c) => !c.isDeleted);
    return HttpResponse.json({ chats: filtered.map(projectChat) });
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
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/chats/:id/restore", ({ params }) => {
    const id = params.id as string;
    const chat = fakeChats.find((c) => c.id === id);
    if (!chat) {
      return HttpResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    chat.isDeleted = false;
    return new HttpResponse(null, { status: 204 });
  }),
];
