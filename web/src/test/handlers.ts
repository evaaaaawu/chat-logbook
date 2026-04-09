import { http, HttpResponse } from "msw";

export const fakeSessions = [
  {
    id: "session-1",
    title: "Build a login page",
    project: "/Users/test/my-web-app",
    createdAt: 1700000000000,
    updatedAt: 1700000200000,
  },
  {
    id: "session-2",
    title: "Fix database migration",
    project: "/Users/test/backend-api",
    createdAt: 1700000100000,
    updatedAt: 1700000300000,
  },
  {
    id: "session-3",
    title: "Refactor utils",
    project: "/Users/test/my-web-app",
    createdAt: 1700000050000,
    updatedAt: 1700000150000,
  },
  {
    id: "session-missing",
    title: "Untitled",
    project: "/Users/test/some-project",
    createdAt: 1699999900000,
    updatedAt: 1699999900000,
  },
];

export const fakeMessages = {
  "session-1": [
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
  "session-2": [
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
  "session-3": [
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

export const handlers = [
  http.get("/api/sessions", () => {
    return HttpResponse.json({ sessions: fakeSessions });
  }),
  http.get("/api/sessions/:id", ({ params }) => {
    const id = params.id as string;
    const messages = fakeMessages[id as keyof typeof fakeMessages];
    if (!messages) {
      return HttpResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return HttpResponse.json({ messages });
  }),
];
