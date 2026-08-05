import type { Locator, Page } from "@playwright/test";

export class DetailPage {
  readonly page: Page;
  readonly detailTitle: Locator;
  readonly firstEpisodeCard: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.detailTitle = page.locator("#detail-title");
    this.firstEpisodeCard = page.locator(".ep-card:first-child");
    this.backButton = page.locator("#detail-back-btn");
  }

  async clickFirstEpisode() {
    await this.firstEpisodeCard.click();
  }

  async clickBack() {
    await this.backButton.click();
  }
}
