import { test, expect } from "@playwright/test";

const MESSAGE_COUNT = 500;

// Last message (index 499) is an assistant turn; first (index 0) is a user turn.
const FIRST_MESSAGE = "User message 1";
const LAST_MESSAGE = `Assistant response ${MESSAGE_COUNT}`;

function generateMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content:
      i % 2 === 0
        ? `User message ${i + 1}`
        : [{ type: "text", text: `Assistant response ${i + 1}` }],
    timestamp: new Date(1700000000000 + i * 1000).toISOString(),
  }));
}

async function openLargeChat(page: import("@playwright/test").Page) {
  // Benign empty SSE stream so the live-update EventSource connects cleanly.
  await page.route(/\/api\/chats\/stream(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ":ok\n\n",
    })
  );
  await page.route(/\/api\/chats\/counts(\?|$)/, (route) =>
    route.fulfill({
      json: { total: 1, projects: [], tags: [], untagged: 1 },
    })
  );
  await page.route(/\/api\/chats\/list-total(\?|$)/, (route) =>
    route.fulfill({ json: { total: 1 } })
  );
  await page.route(/\/api\/chats(\?|$)/, (route) =>
    route.fulfill({
      json: {
        chats: [
          {
            id: "clog_large1",
            sourceId: "large-chat",
            agent: "claude-code",
            title: "Large conversation",
            project: "/test/project",
            sourceFilePath: null,
            createdAt: 1700000000000,
            updatedAt: 1700000000000 + MESSAGE_COUNT * 1000,
          },
        ],
      },
    })
  );
  await page.route(/\/api\/chats\/clog_large1(\?|$)/, (route) =>
    route.fulfill({ json: { messages: generateMessages(MESSAGE_COUNT) } })
  );

  await page.goto("/");
  await page.getByText("Large conversation").click();
}

test.describe("Scroll pill navigation", () => {
  test("opens the chat at the bottom, showing only the jump-to-top control", async ({
    page,
  }) => {
    await openLargeChat(page);

    // Lands on the latest messages, not the first.
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();
    await expect(page.getByText(FIRST_MESSAGE)).toHaveCount(0);

    // At the bottom only the up half shows.
    await expect(
      page.getByRole("button", { name: "Jump to top" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Jump to bottom" })
    ).toHaveCount(0);
  });

  test("jumps to the top and back to the bottom instantly", async ({
    page,
  }) => {
    await openLargeChat(page);
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();

    // Jump to top -> first message lands, and now only the down half shows.
    await page.getByRole("button", { name: "Jump to top" }).click();
    await expect(page.getByText(FIRST_MESSAGE)).toBeVisible();
    await expect(page.getByText(LAST_MESSAGE)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Jump to bottom" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Jump to top" })).toHaveCount(
      0
    );

    // Jump back to the bottom -> last message lands again.
    await page.getByRole("button", { name: "Jump to bottom" }).click();
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();
    await expect(page.getByText(FIRST_MESSAGE)).toHaveCount(0);
  });

  test("jumps with Cmd/Ctrl+Arrow and Home/End keys", async ({ page }) => {
    await openLargeChat(page);
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();

    const modifier = process.platform === "darwin" ? "Meta" : "Control";

    // Modifier+ArrowUp -> first message.
    await page.keyboard.press(`${modifier}+ArrowUp`);
    await expect(page.getByText(FIRST_MESSAGE)).toBeVisible();
    await expect(page.getByText(LAST_MESSAGE)).toHaveCount(0);

    // End -> back to the latest message.
    await page.keyboard.press("End");
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();

    // Home -> first message again.
    await page.keyboard.press("Home");
    await expect(page.getByText(FIRST_MESSAGE)).toBeVisible();
    await expect(page.getByText(LAST_MESSAGE)).toHaveCount(0);
  });

  test("offers jump-to-latest mid-scroll", async ({ page }) => {
    await openLargeChat(page);
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();

    // Scroll up off the bottom edge: away from the bottom, the single pill
    // offers "jump to latest" (down), not "back to top".
    await page.getByTestId("conversation-panel").evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });

    await expect(
      page.getByRole("button", { name: "Jump to bottom" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Jump to top" })).toHaveCount(
      0
    );
  });
});
