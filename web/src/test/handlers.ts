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
