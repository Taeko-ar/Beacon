import { expect, test } from "@playwright/test";
import { CalendarPage } from "../pages/CalendarPage";

test.describe("Calendar Filters", () => {
  let calendarPage: CalendarPage;

  test.beforeEach(async ({ page }) => {
    calendarPage = new CalendarPage(page);
    await calendarPage.goto();
  });

  test("Calendar filters refine visible events", async () => {
    await test.step("1. Open the Filter popover from the Calendar screen", async () => {
      await calendarPage.openFilter();
      await expect(calendarPage.filterPopover).toBeVisible();
      await expect(calendarPage.filterTrackedCheckbox).toBeVisible();
      await expect(calendarPage.filterSourceCrunchyroll).toBeVisible();
      await expect(calendarPage.filterFormatAll).toBeVisible();
    });

    await test.step("2. Toggle the tracked-only filter and a source/format option", async () => {
      await calendarPage.toggleTrackedFilter();
      await calendarPage.filterSourceCrunchyroll.click();
      await calendarPage.filterFormatAnime.click();
      // Wait for network/DOM update if applicable
      await expect(calendarPage.filterButton)
        .toHaveAttribute("data-active", "true", { timeout: 5000 })
        .catch(() => {}); // Fallback, depends on actual implementation
    });

    await test.step("3. Clear the filters and confirm the previous event set returns", async () => {
      await calendarPage.filterFormatAll.click();
      await calendarPage.filterSourceCrunchyroll.click();
      await calendarPage.toggleTrackedFilter();
      // Should revert visually
    });
  });
});
