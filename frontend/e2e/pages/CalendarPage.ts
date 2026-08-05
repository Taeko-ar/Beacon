import type { Locator, Page } from "@playwright/test";

export class CalendarPage {
  readonly page: Page;
  readonly calendarView: Locator;
  readonly grid: Locator;
  readonly prevButton: Locator;
  readonly todayButton: Locator;
  readonly nextButton: Locator;
  readonly filterButton: Locator;
  readonly filterPopover: Locator;
  readonly filterTrackedCheckbox: Locator;
  readonly filterSourceCrunchyroll: Locator;
  readonly filterFormatAll: Locator;
  readonly filterFormatAnime: Locator;
  readonly filterFormatManga: Locator;
  readonly eventTooltip: Locator;
  readonly eventModal: Locator;

  readonly viewModeMonthButton: Locator;
  readonly viewModeWeekButton: Locator;
  readonly weekGrid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.calendarView = page.getByTestId("calendar-view");
    this.grid = page.getByTestId("calendar-grid");
    this.weekGrid = page.getByTestId("calendar-week-grid");
    this.viewModeMonthButton = page.getByTestId("calendar-view-mode-month");
    this.viewModeWeekButton = page.getByTestId("calendar-view-mode-week");
    this.prevButton = page.getByTestId("calendar-prev-month");
    this.todayButton = page.getByTestId("calendar-today");
    this.nextButton = page.getByTestId("calendar-next-month");
    this.filterButton = page.getByTestId("calendar-filter-btn");
    this.filterPopover = page.getByTestId("calendar-filter-popover");
    this.filterTrackedCheckbox = page.getByTestId("filter-tracked");
    this.filterSourceCrunchyroll = page.getByTestId(
      "filter-source-crunchyroll",
    );
    this.filterFormatAll = page.getByTestId("filter-format-all");
    this.filterFormatAnime = page.getByTestId("filter-format-anime");
    this.filterFormatManga = page.getByTestId("filter-format-manga");
    this.eventTooltip = page.getByTestId("event-tooltip");
    this.eventModal = page.getByTestId("event-modal");
  }

  async goto() {
    await this.page.goto("/");
    await this.page.getByTestId("nav-calendar").click();
  }

  async openFilter() {
    await this.filterButton.click();
  }

  async toggleTrackedFilter() {
    await this.filterTrackedCheckbox.click();
  }

  async selectPrevMonth() {
    await this.prevButton.click();
  }

  async selectNextMonth() {
    await this.nextButton.click();
  }

  async selectToday() {
    await this.todayButton.click();
  }
}
