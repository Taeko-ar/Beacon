import { expect, test } from "@playwright/test";
import { CalendarPage } from "../pages/CalendarPage";

test.describe("Calendar Event Interaction", () => {
  let calendarPage: CalendarPage;

  test.beforeEach(async ({ page }) => {
    calendarPage = new CalendarPage(page);
    await calendarPage.goto();
  });

  test("Calendar event interaction is usable when data is present", async () => {
    await test.step("1. Select a day or event chip in the calendar if one is visible", async () => {
      const eventChips = calendarPage.page.locator(".event-chip");
      const count = await eventChips.count();
      if (count > 0) {
        await eventChips.first().click();
        await expect(
          calendarPage.eventTooltip.or(calendarPage.eventModal),
        ).toBeVisible();
      } else {
        // No events, skip interaction, but interface should remain responsive
      }
      await expect(calendarPage.calendarView).toBeVisible();
    });
  });
});
