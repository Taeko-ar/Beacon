import { expect, test } from "@playwright/test";
import { CalendarPage } from "../pages/CalendarPage";

test.describe("Calendar Screen Navigation", () => {
  let calendarPage: CalendarPage;

  test.beforeEach(async ({ page }) => {
    calendarPage = new CalendarPage(page);
    await calendarPage.goto();
  });

  test("Calendar loads and supports core navigation", async () => {
    await test.step("1. Open the app at the configured frontend URL and navigate to the Calendar tab", async () => {
      await expect(calendarPage.calendarView).toBeVisible();
      await expect(
        calendarPage.page
          .locator("h1, h2, h3")
          .filter({
            hasText:
              /January|February|March|April|May|June|July|August|September|October|November|December|Week/i,
          })
          .first(),
      ).toBeVisible();
      await expect(calendarPage.prevButton).toBeVisible();
      await expect(calendarPage.todayButton).toBeVisible();
      await expect(calendarPage.nextButton).toBeVisible();
      await expect(calendarPage.filterButton).toBeVisible();
    });

    await test.step("2. Use the Month and Week toggle buttons", async () => {
      await calendarPage.viewModeWeekButton.click();
      await expect(calendarPage.weekGrid).toBeVisible();
      await calendarPage.viewModeMonthButton.click();
      await expect(calendarPage.grid).toBeVisible();
    });

    await test.step("3. Use Prev, Today, and Next to move between date ranges", async () => {
      await calendarPage.selectNextMonth();
      await expect(
        calendarPage.page.locator("h1, h2, h3").first(),
      ).toBeVisible(); // Could check specific text change
      await calendarPage.selectPrevMonth();
      await calendarPage.selectPrevMonth();
      await expect(
        calendarPage.page.locator("h1, h2, h3").first(),
      ).toBeVisible();
      await calendarPage.selectToday();
      await expect(
        calendarPage.page.locator("h1, h2, h3").first(),
      ).toBeVisible();
    });
  });
});
