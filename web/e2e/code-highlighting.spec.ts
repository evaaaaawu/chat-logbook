import { test, expect } from "@playwright/test";

// Large enough that colouring every line has a real cost, so an expansion is a
// genuine measurement rather than a toy.
const LINE_COUNT = 200;

function largePatch() {
  const lines: string[] = [];
  for (let i = 0; i < LINE_COUNT; i += 1) {
    lines.push(`+const value${i} = ${i} as const;`);
  }
  return [
    { oldStart: 1, oldLines: 0, newStart: 1, newLines: LINE_COUNT, lines },
  ];
}

// A Read result as the tool writes it: `<line number>\t<content>`.
function largeReadResult() {
  const lines: string[] = [];
  for (let i = 1; i <= LINE_COUNT; i += 1) {
    lines.push(`${i}\tconst value${i} = ${i} as const;`);
  }
  return lines.join("\n");
}

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
            id: "clog_code1",
            sourceId: "code-chat",
            agent: "claude-code",
            title: "Code conversation",
            project: "/test/project",
            sourceFilePath: null,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      },
    })
  );
  await page.route(/\/api\/chats\/clog_code1(\?|$)/, (route) =>
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
  await page.getByText("Code conversation").click();
}

test("a large diff expands and highlights in a real browser without stalling", async ({
  page,
}) => {
  await openChatWith(page, [
    {
      type: "tool_use",
      id: "tool_1",
      name: "Write",
      input: { file_path: "web/src/constants.ts" },
    },
    {
      type: "tool_result",
      tool_use_id: "tool_1",
      content: "File written",
      file_path: "web/src/constants.ts",
      patch: largePatch(),
    },
  ]);

  // The collapsed tool unit summarises the write; the full path shows once the
  // diff is expanded.
  const summary = page.getByText("Wrote constants.ts");
  await expect(summary).toBeVisible();
  await expect(page.getByTestId("row-diff-stat")).toHaveText("+200 -0");

  const start = Date.now();
  await summary.click();
  await expect(page.getByText("web/src/constants.ts")).toBeVisible();

  // Highlighting arrives after the lazy highlighter load — the keyword tokens
  // appear, proving the language was inferred and applied.
  await expect(page.locator(".hljs-keyword").first()).toBeVisible();
  const elapsed = Date.now() - start;

  // The default line cap folds the tail behind a reveal, so the first view is
  // never the whole 200 lines — the expansion cannot stall on them.
  await expect(
    page.getByRole("button", { name: /Show \d+ more/ })
  ).toBeVisible();

  // Generous bound: this only fails if expansion genuinely blocks, not on
  // ordinary render jitter.
  expect(elapsed).toBeLessThan(3000);

  // The added ground survives under the token colours: rows are still tinted.
  const addedRow = page
    .locator('[data-testid="diff-line"][data-kind="add"]')
    .first();
  await expect(addedRow).toHaveClass(/bg-green-500\/10/);
  await expect(addedRow.locator(".hljs-keyword").first()).toBeVisible();
});

test("a large read expands as a highlighted, numbered excerpt without stalling", async ({
  page,
}) => {
  await openChatWith(page, [
    {
      type: "tool_use",
      id: "tool_2",
      name: "Read",
      input: { file_path: "web/src/constants.ts" },
    },
    {
      type: "tool_result",
      tool_use_id: "tool_2",
      content: largeReadResult(),
    },
  ]);

  const summary = page.getByText("Read: web/src/constants.ts");
  await expect(summary).toBeVisible();

  const start = Date.now();
  await summary.click();

  await expect(page.locator(".hljs-keyword").first()).toBeVisible();
  const elapsed = Date.now() - start;

  // The cap folds the tail, so a whole file read into the pane cannot stall it.
  await expect(
    page.getByRole("button", { name: /Show \d+ more/ })
  ).toBeVisible();
  expect(elapsed).toBeLessThan(3000);

  // The numbers were lifted into a gutter: the first row shows line 1 beside
  // its code, not the raw `1\t…` the tool wrote.
  const firstRow = page.locator('[data-testid="excerpt-line"]').first();
  await expect(firstRow).toContainText("1");
  await expect(firstRow.locator(".hljs-keyword").first()).toBeVisible();
});

test("a tool call with no view of its own shows its input as coloured JSON", async ({
  page,
}) => {
  await openChatWith(page, [
    {
      type: "tool_use",
      id: "tool_3",
      name: "Grep",
      input: {
        pattern: "useState",
        // Long enough that an unwrapped line would stretch the pane if the
        // block did not scroll on its own.
        path: `web/src/${"very-long-directory-name/".repeat(20)}index.ts`,
      },
    },
    { type: "tool_result", tool_use_id: "tool_3", content: "No matches found" },
  ]);

  await page.getByText("Grep", { exact: false }).first().click();

  const input = page.getByTestId("json-input");
  await expect(input.locator(".hljs-attr").first()).toBeVisible();

  // The long value scrolls inside the block rather than widening it: the block
  // stays within its column while its content overflows.
  const box = await input.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    parentWidth: (node.parentElement as HTMLElement).clientWidth,
  }));
  expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
  expect(box.clientWidth).toBeLessThanOrEqual(box.parentWidth);
});
