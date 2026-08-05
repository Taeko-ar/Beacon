import type { Locator, Page } from "@playwright/test";

export class PlayerPage {
  readonly page: Page;
  readonly playerContainer: Locator;
  readonly playerTitle: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.playerContainer = page.locator("#video-player-container");
    this.playerTitle = page.locator("#player-title");
    this.nextButton = page.locator("#next-ep-btn");
    this.prevButton = page.locator("#prev-ep-btn");
    this.backButton = page.locator("#player-back-btn");
  }

  async clickNextEpisode() {
    await this.nextButton.click();
  }

  async clickPrevEpisode() {
    await this.prevButton.click();
  }

  async clickBack() {
    await this.backButton.click();
  }
}
