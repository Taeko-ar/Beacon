import { expect, test } from "@playwright/test";
import { DetailPage } from "./pages/DetailPage";
import { LibraryPage } from "./pages/LibraryPage";
import { PlayerPage } from "./pages/PlayerPage";

test.describe("Test group", () => {
  test("seed", async ({ page }) => {
    // Reference the page objects to mark them as used
    const _unused = [DetailPage, LibraryPage, PlayerPage];
  });
});
