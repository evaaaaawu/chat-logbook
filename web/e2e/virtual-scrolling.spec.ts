import { test, expect } from "@playwright/test";

const MESSAGE_COUNT = 500;

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

test.describe("Virtual scrolling", () => {
  test(`renders far fewer DOM nodes than ${MESSAGE_COUNT} messages`, async ({
    page,
  }) => {
    // Intercept API calls with fake data
    await page.route("**/api/sessions", (route) =>
      route.fulfill({
        json: {
          sessions: [
            {
              id: "large-session",
              title: "Large conversation",
              project: "/test/project",
              createdAt: 1700000000000,
              updatedAt: 1700000000000 + MESSAGE_COUNT * 1000,
            },
          ],
        },
      })
    );

    await page.route("**/api/sessions/large-session", (route) =>
      route.fulfill({
        json: { messages: generateMessages(MESSAGE_COUNT) },
      })
    );

    await page.goto("/");

    // Click the session to load messages
    await page.getByText("Large conversation").click();

    // Wait for at least one message to render
    await expect(page.getByText("User message 1")).toBeVisible();

    // Count rendered message bubbles (each has a data-role attribute)
    const renderedNodes = await page.locator("[data-role]").count();

    // Virtual scrolling should render far fewer nodes than the total
    expect(renderedNodes).toBeGreaterThan(0);
    expect(renderedNodes).toBeLessThan(MESSAGE_COUNT / 2);
  });
});
