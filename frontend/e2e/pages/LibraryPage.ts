import type { Locator, Page } from "@playwright/test";

export class LibraryPage {
  readonly page: Page;
  readonly navBrand: Locator;
  readonly libraryTab: Locator;
  readonly trackingTab: Locator;
  readonly searchInput: Locator;
  readonly sortSelect: Locator;
  readonly mediaCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navBrand = page.locator(".nav-brand");
    this.libraryTab = page.locator("#tab-library");
    this.trackingTab = page.locator("#tab-tracking");
    this.searchInput = page.locator("#search-input");
    this.sortSelect = page.locator("#sort-select");
    this.mediaCards = page.locator("#library-grid .media-card");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async selectLibraryTab() {
    await this.libraryTab.click();
  }

  async selectTrackingTab() {
    await this.trackingTab.click();
  }

  async clickFirstMediaCard() {
    await this.mediaCards.first().click();
  }
}
