import { test, expect } from "@playwright/test";

const CODE = "const answer = 42;\nreturn answer;";

async function openChatWithCode(page: import("@playwright/test").Page) {
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
            id: "clog_copy1",
            sourceId: "copy-chat",
            agent: "claude-code",
            title: "Copyable conversation",
            project: "/test/project",
            sourceFilePath: null,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      },
    })
  );
  await page.route(/\/api\/chats\/clog_copy1(\?|$)/, (route) =>
    route.fulfill({
      json: {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: `Here you go:\n\n\`\`\`ts\n${CODE}\n\`\`\``,
              },
            ],
            timestamp: "2023-11-14T22:13:20.000Z",
          },
        ],
      },
    })
  );

  await page.goto("/");
  await page.getByText("Copyable conversation").click();
}

test.describe("Copy affordances", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("reveals both copy buttons on hover, each with a real box", async ({
    page,
  }) => {
    await openChatWithCode(page);

    const messageCopy = page.getByRole("button", { name: "Copy message" });
    const codeCopy = page.getByRole("button", { name: "Copy code" });

    // Hidden until the reader reaches for them: present in the tree, but not
    // painted. A component test cannot see this — jsdom computes no opacity.
    await expect(messageCopy).toHaveCSS("opacity", "0");
    await expect(codeCopy).toHaveCSS("opacity", "0");

    await page.getByText("Here you go:").hover();
    await expect(messageCopy).toHaveCSS("opacity", "1");

    // A button can be "visible" to a query while rendering as a collapsed box.
    const box = await messageCopy.boundingBox();
    expect(box?.width).toBeGreaterThan(12);
    expect(box?.height).toBeGreaterThan(12);
  });

  test("takes the code away exactly as written", async ({ page }) => {
    await openChatWithCode(page);

    await page
      .getByRole("button", { name: "Copy code" })
      .click({ force: true });

    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(CODE);
  });
});
