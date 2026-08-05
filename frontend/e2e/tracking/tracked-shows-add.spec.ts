import { expect, test } from "@playwright/test";
import { TrackingPage } from "../pages/TrackingPage";

test.describe("Tracked Shows Add Flow", () => {
  let trackingPage: TrackingPage;

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/track", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.fallback();
      }
    });
    trackingPage = new TrackingPage(page);
    await page.goto("/");
    await page.getByTestId("nav-tracking").click(); // Assuming nav has test id
  });

  test("Tracked shows screen loads and allows manual add flow", async () => {
    await test.step("1. Open the app and switch to the Tracked Shows tab", async () => {
      await expect(trackingPage.heading).toBeVisible();
      await trackingPage.ensureAddModalOpen();
      await expect(trackingPage.titleInput).toBeVisible();
      await expect(
        trackingPage.trackedCards
          .first()
          .or(
            trackingPage.page.getByText(
              "No tracked shows match your filters. Add one above!",
            ),
          ),
      ).toBeVisible();
    });

    await test.step("2. Enter a valid anime title, subgroup, and resolution, then submit the form", async () => {
      await trackingPage.titleInput.fill("Test Anime");
      await trackingPage.subgroupInput.fill("SubsPlease");
      await trackingPage.resolutionSelect
        .selectOption({ label: "1080p" })
        .catch(() => trackingPage.resolutionSelect.fill("1080p"));
      await trackingPage.trackButton.click();

      // await expect(trackingPage.trackedCards.filter({ hasText: "Test Anime" })).toBeVisible();
      await expect(trackingPage.titleInput).toHaveValue("");
    });
  });
});
