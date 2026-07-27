import { test, expect, type Locator, type Page } from "@playwright/test";

// Which end of a label gives way is a layout claim, and layout is what a jsdom
// component test cannot see: every box there measures zero. Measured here (#262).

const DIR = "/Users/eva/Documents/chat-logbook/web/src/conversation";
const NAME = "CollapsibleToolCall.tsx";
const LONG_PATH = `${DIR}/${NAME}`;

const LONG_PHRASE =
  "Count how many archived tool calls carry a description of their own";

/** Mount a one-turn chat whose assistant message carries `blocks`. */
async function openChatWith(page: Page, blocks: unknown[]) {
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
            id: "clog_label1",
            sourceId: "label-chat",
            agent: "claude-code",
            title: "A long-winded conversation",
            project: "/test/project",
            sourceFilePath: null,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      },
    })
  );
  await page.route(/\/api\/chats\/clog_label1(\?|$)/, (route) =>
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
  await page.getByText("A long-winded conversation").click();
}

function editOf(filePath: string) {
  return [
    {
      type: "tool_use",
      id: "tool_1",
      name: "Edit",
      input: { file_path: filePath },
      action: { kind: "edit", object: { type: "path", value: filePath } },
    },
    {
      type: "tool_result",
      tool_use_id: "tool_1",
      content: "File updated",
      file_path: filePath,
      patch: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 2,
          lines: ["-old", "+one", "+two"],
        },
      ],
    },
  ];
}

function ranOf(description: string) {
  return [
    {
      type: "tool_use",
      id: "tool_1",
      name: "Bash",
      input: { command: "sqlite3 archive.db", description },
      action: {
        kind: "execute",
        object: { type: "phrase", value: description },
      },
    },
  ];
}

/**
 * Whether the first and last characters of a slot's text are still drawn inside
 * it — which is how the reader can tell which end the ellipsis ate.
 */
async function endsInView(
  slot: Locator
): Promise<{ first: boolean; last: boolean }> {
  return slot.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() as Text;
    const box = el.getBoundingClientRect();
    const rectOf = (start: number, end: number) => {
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      return range.getBoundingClientRect();
    };
    const inside = (rect: DOMRect) =>
      rect.left >= box.left - 1 && rect.right <= box.right + 1;
    return {
      first: inside(rectOf(0, 1)),
      last: inside(rectOf(text.length - 1, text.length)),
    };
  });
}

test("a squeezed path loses its directory, never its filename", async ({
  page,
}) => {
  // A narrow window squeezes the third pane, so something has to give way.
  await page.setViewportSize({ width: 760, height: 700 });
  await openChatWith(page, editOf(LONG_PATH));

  const dir = page.getByTestId("row-label-dir");
  const name = page.getByTestId("row-label-name");
  await expect(name).toHaveText(`/${NAME}`);

  // The row is genuinely out of room, and the directory is what ran out of it.
  const squeezed = await dir.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(squeezed).toBe(true);

  // The filename is drawn whole, inside the row rather than past its edge.
  const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);
  const nameBox = (await name.boundingBox())!;
  const rowBox = (await page.getByTestId("row-label").boundingBox())!;
  expect(nameBox.x).toBeGreaterThanOrEqual(rowBox.x);
  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(
    rowBox.x + rowBox.width + 1
  );

  // What the directory kept is its tail — the part next to the filename — so
  // the ellipsis is at the left, not the right.
  expect(await endsInView(dir)).toEqual({ first: false, last: true });

  // The counts still sit at the trailing edge, outside anything truncating.
  const statBox = (await page.getByTestId("row-diff-stat").boundingBox())!;
  expect(statBox.width).toBeGreaterThan(0);
  expect(statBox.x).toBeGreaterThanOrEqual(nameBox.x + nameBox.width);
});

test("the verb survives a width that leaves nothing else", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 700 });
  await openChatWith(page, editOf(LONG_PATH));

  const verb = page.getByTestId("row-label-verb");
  await expect(verb).toHaveText("Edited");
  expect(await verb.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    false
  );
});

test("a phrase still gives way at its end", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  await openChatWith(page, ranOf(LONG_PHRASE));

  const label = page.getByTestId("row-label");
  const squeezed = await label.evaluate(
    (el) => el.scrollWidth > el.clientWidth
  );
  expect(squeezed).toBe(true);
  expect(await endsInView(label)).toEqual({ first: true, last: false });
});
