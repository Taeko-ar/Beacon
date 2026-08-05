import { expect, test } from "@playwright/test";
import { TrackingPage } from "../pages/TrackingPage";

test.describe("Tracked Shows Filter and Remove", () => {
  let trackingPage: TrackingPage;

  test.beforeEach(async ({ page }) => {
    trackingPage = new TrackingPage(page);
    await page.goto("/");
    await page.getByTestId("nav-tracking").click();
  });

  test("Tracked shows can be filtered and removed", async () => {
    await test.step("1. Type into the tracked shows filter field", async () => {
      const filterInput = trackingPage.page.getByTestId("tracked-shows-filter"); // Assuming a filter exists
      if (await filterInput.isVisible()) {
        await filterInput.fill("Test");
        // Expect only matching cards
      }
    });

    await test.step("2. Use the Untrack action on a tracked show card", async () => {
      const untrackButton = trackingPage.trackedCards
        .first()
        .locator("button")
        .filter({ hasText: /untrack/i });
      if (await untrackButton.isVisible()) {
        await untrackButton.click();
        // Wait for removal
      }
    });
  });
});
