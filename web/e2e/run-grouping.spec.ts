import { test, expect } from "@playwright/test";

// The Run is a spacing claim, and spacing is exactly what a component test in
// jsdom cannot see: every box there measures zero. Measured here instead (#236).
async function openRunChat(page: import("@playwright/test").Page) {
  await page.route(/\/api\/chats\/stream(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ":ok\n\n",
    })
  );
  await page.route(/\/api\/chats\/counts(\?|$)/, (route) =>
    route.fulfill({ json: { total: 1, projects: [], tags: [], untagged: 1 } })
  );
  await page.route(/\/api\/chats\/list-total(\?|$)/, (route) =>
    route.fulfill({ json: { total: 1 } })
  );
  await page.route(/\/api\/chats(\?|$)/, (route) =>
    route.fulfill({
      json: {
        chats: [
          {
            id: "clog_run1",
            sourceId: "run-chat",
            agent: "claude-code",
            title: "A burst of activity",
            project: "/test/project",
            sourceFilePath: null,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      },
    })
  );
  const call = (id: string, path: string) => ({
    type: "tool_use",
    id,
    name: "Read",
    input: { file_path: path },
  });
  await page.route(/\/api\/chats\/clog_run1(\?|$)/, (route) =>
    route.fulfill({
      json: {
        messages: [
          {
            id: "m-prose",
            role: "user",
            content: [{ type: "text", text: "Find where this breaks." }],
            timestamp: "2023-11-14T22:13:20.000Z",
          },
          {
            id: "m-1",
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Start with the entry point." },
              call("t1", "/a.ts"),
            ],
            timestamp: "2023-11-14T22:13:21.000Z",
          },
          {
            id: "m-2",
            role: "assistant",
            content: [call("t2", "/b.ts")],
            timestamp: "2023-11-14T22:13:22.000Z",
          },
          {
            id: "m-3",
            role: "assistant",
            content: [call("t3", "/c.ts")],
            timestamp: "2023-11-14T22:13:23.000Z",
          },
        ],
      },
    })
  );

  await page.goto("/");
  await page.getByText("A burst of activity").click();
}

async function rowTop(
  page: import("@playwright/test").Page,
  path: string
): Promise<{ top: number; bottom: number }> {
  const box = await page
    .getByRole("button", { name: new RegExp(`Read: ${path}`) })
    .boundingBox();
  return { top: box!.y, bottom: box!.y + box!.height };
}

test.describe("Run density", () => {
  test("sits the rows of a Run a few pixels apart, across turns", async ({
    page,
  }) => {
    await openRunChat(page);

    const a = await rowTop(page, "/a\\.ts");
    const b = await rowTop(page, "/b\\.ts");
    const c = await rowTop(page, "/c\\.ts");

    // Every gap here crosses a message boundary the Agent recorded, which used
    // to cost roughly 40px of air each.
    expect(b.top - a.bottom).toBeLessThan(8);
    expect(c.top - b.bottom).toBeLessThan(8);
  });

  test("keeps prose apart from the Run that follows it", async ({ page }) => {
    await openRunChat(page);

    const prose = (await page
      .getByText("Find where this breaks.")
      .boundingBox())!;
    const thinking = (await page
      .getByRole("button", { name: /Thinking/ })
      .boundingBox())!;

    expect(thinking.y - (prose.y + prose.height)).toBeGreaterThan(16);
  });
});
