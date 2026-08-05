import type { Locator, Page } from "@playwright/test";

export class TrackingPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly titleInput: Locator;
  readonly subgroupInput: Locator;
  readonly resolutionSelect: Locator;
  readonly trackButton: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly searchResultCards: Locator;
  readonly trackedCards: Locator;
  readonly firstUseInfoButton: Locator;
  readonly addShowModalBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator("h2");
    this.addShowModalBtn = page.getByTestId("add-show-modal-btn");
    this.titleInput = page.locator("#track-title");
    this.subgroupInput = page.locator("#track-subgroup");
    this.resolutionSelect = page.locator("#track-res");
    this.trackButton = page.locator("#add-track-button");
    this.searchInput = page.locator("#search-input");
    this.searchButton = page.locator("#search-button");
    this.searchResultCards = page.locator(".search-result-card");
    this.trackedCards = page.locator(".tracked-card, .tracked-row");
    this.firstUseInfoButton = page
      .locator(".search-result-card button")
      .first();
  }

  async ensureAddModalOpen() {
    if (!(await this.titleInput.isVisible())) {
      if (await this.addShowModalBtn.isVisible()) {
        await this.addShowModalBtn.click();
      }
    }
  }

  async trackShow(title: string) {
    await this.ensureAddModalOpen();
    await this.titleInput.fill(title);
    await this.trackButton.click();
  }

  async searchNyaa(query: string) {
    await this.ensureAddModalOpen();
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }
}
