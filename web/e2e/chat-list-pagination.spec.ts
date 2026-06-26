import { test, expect, type Page } from "@playwright/test";

// More chats than the keyset cap (200) so the loaded window can grow past it —
// the condition that crashed the background refresh. Descending updatedAt order,
// so "Chat 0" is newest and sorts first. The cursor here just encodes the next
// offset — opaque to the frontend, which only echoes nextCursor back.
const TOTAL = 220;
const MAX_PAGE_LIMIT = 200;

function allChats() {
  return Array.from({ length: TOTAL }, (_, i) => ({
    id: `clog_${i}`,
    sourceId: `src_${i}`,
    agent: "claude-code",
    title: `Chat ${i}`,
    project: "/test/project",
    sourceFilePath: null,
    createdAt: 1700000000000 + (TOTAL - i),
    updatedAt: 1700000000000 + (TOTAL - i) * 1000,
  }));
}

// Mirror the merged backend (#142): `limit` opts into one keyset page, the
// cursor is the next offset (base64), nextCursor is null on the last page, and —
// crucially — a `limit` over the cap is rejected with 400, like the real server.
async function mockChatPages(page: Page): Promise<void> {
  await page.route(/\/api\/tags(\?|$)/, (route) =>
    route.fulfill({ json: { tags: [] } })
  );
  await page.route(/\/api\/chats(\?|$)/, (route, request) => {
    const url = new URL(request.url());
    const limitParam = url.searchParams.get("limit");
    const chats = allChats();
    if (limitParam === null) {
      route.fulfill({ json: { chats } });
      return;
    }
    const limit = Number(limitParam);
    if (limit > MAX_PAGE_LIMIT) {
      route.fulfill({ status: 400, json: { error: "Invalid limit" } });
      return;
    }
    const cursor = url.searchParams.get("cursor");
    const start = cursor ? Number(atob(cursor)) : 0;
    const pageItems = chats.slice(start, start + limit);
    const end = start + limit;
    const nextCursor = end < chats.length ? btoa(String(end)) : null;
    route.fulfill({ json: { chats: pageItems, nextCursor } });
  });
}

test.describe("Chat list pagination", () => {
  test("loads further pages as the list is scrolled, not all at once", async ({
    page,
  }) => {
    await mockChatPages(page);
    await page.goto("/");

    // First page renders (default page size is 30), so the newest chat is shown
    // but a chat from a later page is not in the data yet at all.
    await expect(page.getByText("Chat 0", { exact: true })).toBeVisible();
    await expect(page.getByText("Chat 55", { exact: true })).toHaveCount(0);

    // Scrolling to the bottom triggers the next page; the window then grows, so
    // the new bottom is further down. Keep scrolling to the current bottom until
    // a later-page chat comes into view — it exists only because the cursor
    // fetch ran. The first page alone never contained it.
    const scroller = page.getByTestId("chat-scroll");
    await expect(async () => {
      await scroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(page.getByText("Chat 55", { exact: true })).toBeVisible({
        timeout: 500,
      });
    }).toPass({ timeout: 8000 });
  });

  test("does not blank out when the loaded window grows past the page-limit cap", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await mockChatPages(page);
    await page.goto("/");
    await expect(page.getByText("Chat 0", { exact: true })).toBeVisible();

    // Walk every page so the window exceeds 200, then sit at the bottom past a
    // 4s background-refresh tick — the refresh must not request more than the
    // cap nor crash on a rejected response.
    const scroller = page.getByTestId("chat-scroll");
    for (let i = 0; i < 60; i++) {
      await scroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(150);
    }

    await expect(page.getByTestId("chat-row").first()).toBeVisible();
    await expect(page.getByText("Chat 219", { exact: true })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
