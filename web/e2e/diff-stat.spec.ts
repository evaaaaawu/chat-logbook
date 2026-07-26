import { test, expect } from "@playwright/test";

// The row names the file by its basename, so what has to give way is a long
// name in a narrow pane — the case that used to eat the counts (#250).
const LONG_NAME =
  "CollapsibleToolCallSummaryRowWithAVeryLongDescriptiveFileName.test.tsx";
const LONG_PATH = `web/src/conversation/${LONG_NAME}`;

// The tokens, as the browser reports them.
const AT_REST_ADDED = "rgb(79, 122, 94)"; // --diff-add-muted #4f7a5e
const AT_REST_REMOVED = "rgb(158, 107, 110)"; // --diff-remove-muted #9e6b6e
const RESOLVED_ADDED = "rgb(34, 197, 94)"; // --diff-add #22c55e
const RESOLVED_REMOVED = "rgb(255, 110, 100)"; // --diff-remove #ff6e64

/** Mount a one-turn chat whose assistant message carries `blocks`. */
async function openChatWith(
  page: import("@playwright/test").Page,
  blocks: unknown[]
) {
  // Benign empty SSE stream so the live-update EventSource connects cleanly.
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
            id: "clog_stat1",
            sourceId: "stat-chat",
            agent: "claude-code",
            title: "Edit conversation",
            project: "/test/project",
            sourceFilePath: null,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      },
    })
  );
  await page.route(/\/api\/chats\/clog_stat1(\?|$)/, (route) =>
    route.fulfill({
      json: {
        messages: [
          {
            role: "assistant",
            content: blocks,
            timestamp: "2023-11-14T22:13:20.000Z",
          },
        ],
      },
    })
  );

  await page.goto("/");
  await page.getByText("Edit conversation").click();
}

/** The one collapsed row carrying a diff stat. */
function statRow(page: import("@playwright/test").Page) {
  return page
    .locator("button")
    .filter({ has: page.getByTestId("row-diff-stat") });
}

function editOf(filePath: string, added: number, removed: number) {
  const lines = [
    ...Array.from({ length: removed }, (_, i) => `-old${i}`),
    ...Array.from({ length: added }, (_, i) => `+new${i}`),
  ];
  return [
    {
      type: "tool_use",
      id: "tool_1",
      name: "Edit",
      input: { file_path: filePath },
    },
    {
      type: "tool_result",
      tool_use_id: "tool_1",
      content: "File updated",
      file_path: filePath,
      patch: [
        {
          oldStart: 1,
          oldLines: removed,
          newStart: 1,
          newLines: added,
          lines,
        },
      ],
    },
  ];
}

test("the counts survive a name long enough to truncate", async ({ page }) => {
  // A narrow window squeezes the third pane, so the name has to give way.
  await page.setViewportSize({ width: 760, height: 700 });
  await openChatWith(page, editOf(LONG_PATH, 39, 2));

  const stat = page.getByTestId("row-diff-stat");
  await expect(stat).toHaveText("+39 -2");

  const label = page.getByText(`Edited ${LONG_NAME}`);
  const truncated = await label.evaluate(
    (el) => el.scrollWidth > el.clientWidth
  );
  const statBox = await stat.boundingBox();
  const rowBox = await statRow(page).boundingBox();

  // The row is genuinely out of room — and the counts are still on it, drawn at
  // its trailing edge rather than pushed past it.
  expect(truncated).toBe(true);
  expect(statBox).not.toBeNull();
  expect(statBox!.width).toBeGreaterThan(0);
  expect(statBox!.x + statBox!.width).toBeLessThanOrEqual(
    rowBox!.x + rowBox!.width + 1
  );
});

test("the counts rest near the label and resolve on hover and on opening", async ({
  page,
}) => {
  await openChatWith(page, editOf("web/src/App.tsx", 39, 2));

  const added = page.getByTestId("row-diff-added");
  const removed = page.getByTestId("row-diff-removed");
  await expect(added).toHaveCSS("color", AT_REST_ADDED);
  await expect(removed).toHaveCSS("color", AT_REST_REMOVED);

  const row = statRow(page);
  await row.hover();
  await expect(added).toHaveCSS("color", RESOLVED_ADDED);
  await expect(removed).toHaveCSS("color", RESOLVED_REMOVED);

  // Opening the row keeps them resolved, so the collapsed line and the diff it
  // opened onto say the same thing in the same colours.
  await row.click();
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("diff-line").first()).toBeVisible();
  await expect(added).toHaveCSS("color", RESOLVED_ADDED);
  await expect(removed).toHaveCSS("color", RESOLVED_REMOVED);
});

test("a zero side dims instead of disappearing", async ({ page }) => {
  await openChatWith(page, editOf("web/src/App.tsx", 12, 0));

  const removed = page.getByTestId("row-diff-removed");
  await expect(removed).toBeVisible();
  await expect(removed).toHaveText("-0");
  await expect(removed).toHaveCSS("opacity", "0.5");
  await expect(page.getByTestId("row-diff-added")).toHaveCSS("opacity", "1");
});
