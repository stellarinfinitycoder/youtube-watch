import { expect, test } from "@playwright/test";

test.describe("fixture smoke", () => {
  test("loads fixture board and can fetch a channel", async ({ page }) => {
    await page.goto("/?fixture=1");

    await expect(page.getByTestId("topbar-board-select")).toBeVisible();
    await expect(page.getByTestId("topbar-logo")).toBeVisible();

    await page.getByTestId("column-fetch").first().click();
    await expect(page.locator("[data-video-id]").first()).toBeVisible();
  });

  test("playlist modal opens and closes", async ({ page }) => {
    await page.goto("/?fixture=1");

    const firstColumn = page.locator(".channel-column").first();
    await firstColumn.getByTestId("column-fetch").click();
    await expect(page.locator("[data-video-id]").first()).toBeVisible();

    await firstColumn.getByTestId("column-play").click();
    await expect(page.locator(".video-player-modal .ant-modal-content")).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".video-player-modal .ant-modal-content")).toBeHidden();
  });

  test("save and delete modals can be opened", async ({ page }) => {
    await page.goto("/?fixture=1");

    const firstColumn = page.locator(".channel-column").first();
    await firstColumn.getByTestId("column-fetch").click();
    await expect(page.locator("[data-video-id]").first()).toBeVisible();

    await firstColumn.getByTestId("video-save").first().click();
    await expect(page.getByText("Save video?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).last().click();

    await firstColumn.getByTestId("column-delete").click();
    await expect(page.locator(".ant-modal .ant-modal-body").getByText(/Delete channel/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
  });

  test("mobile viewport basic pass", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?fixture=1");

    const firstColumn = page.locator(".channel-column").first();
    await firstColumn.getByTestId("column-fetch").click();
    await expect(page.locator("[data-video-id]").first()).toBeVisible();
  });
});
