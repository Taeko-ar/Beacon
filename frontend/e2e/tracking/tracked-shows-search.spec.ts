import { expect, test } from "@playwright/test";
import { TrackingPage } from "../pages/TrackingPage";

test.describe("Tracked Shows Search Flow", () => {
  let trackingPage: TrackingPage;

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/search?q=Frieren", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            title: "[SubsPlease] Sousou no Frieren - 01 (1080p) [F1234567].mkv",
            magnet_link: "magnet:?xt=urn:btih:123",
            subgroup: "SubsPlease",
            resolution: "1080p",
          },
        ]),
      });
    });
    trackingPage = new TrackingPage(page);
    await page.goto("/");
    await page.getByTestId("nav-tracking").click();
  });

  test("Tracked shows search and prefill flow works", async () => {
    await test.step("1. Enter a search term in the Nyaa search field and submit the search", async () => {
      await trackingPage.searchNyaa("Frieren");
      await expect(trackingPage.searchResultCards.first()).toBeVisible();
    });

    await test.step("2. Click Use Info on a result", async () => {
      await trackingPage.firstUseInfoButton.click();
      await expect(trackingPage.titleInput).not.toHaveValue("");
    });
  });
});
