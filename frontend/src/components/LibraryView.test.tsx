import { fireEvent, render } from "solid-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "./LibraryView";

describe("LibraryView Component", () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url || "";

        if (url.includes("/api/track")) {
          if (init?.method === "POST") {
            const body = JSON.parse(init.body as string);
            return Promise.resolve({
              ok: true,
              headers: new Headers({ "content-type": "application/json" }),
              json: () => Promise.resolve(body),
            } as Response);
          }
          if (init?.method === "DELETE") {
            return Promise.resolve({
              ok: true,
              headers: new Headers({ "content-type": "application/json" }),
              json: () => Promise.resolve({ status: "removed" }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () =>
              Promise.resolve([
                {
                  id: "solo-leveling",
                  title: "Solo Leveling",
                  subgroup: "SubsPlease",
                  resolution: "1080p",
                  lastDownloaded: 12,
                },
              ]),
          } as Response);
        }

        if (url.includes("/api/calendar")) {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () =>
              Promise.resolve([
                {
                  id: 1,
                  media_id: 1,
                  title: "Solo Leveling",
                  airing_at: 1787432082,
                  airing_at_art: "2026-08-22 18:00 (ART)",
                  release_date: "2026-08-22",
                  episode: 13,
                  description: "Sung Jinwoo hunting monsters.",
                  tags: ["Action", "Fantasy"],
                  cover_image: "https://example.com/cover.jpg",
                  format: "TV",
                  is_tracked: true,
                  sources: ["Crunchyroll", "JKAnime"],
                  has_manga: false,
                  chapters: [],
                  relations: [],
                },
              ]),
          } as Response);
        }

        if (url.includes("/api/catalog/search")) {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () =>
              Promise.resolve({
                items: [
                  {
                    id: "100",
                    title: "Frieren",
                    image_url: "https://example.com/frieren.jpg",
                    synopsis: "Elf journey.",
                    tags: ["Fantasy"],
                    is_torrenteable: true,
                  },
                ],
              }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve([]),
        } as Response);
      });
  });

  it("renders library grid with tracked shows and hover overlay", async () => {
    const { findByText, getByTestId, findAllByText } = render(() => (
      <LibraryView />
    ));

    expect(await findByText("Top Picks for You")).toBeTruthy();
    const titleElements = await findAllByText("Solo Leveling");
    expect(titleElements.length).toBeGreaterThan(0);
    expect(getByTestId("library-card-solo-leveling")).toBeTruthy();
  });

  it("performs search and displays results with add button", async () => {
    const { getByTestId, findByText } = render(() => <LibraryView />);

    const searchInput = getByTestId("library-search-input") as HTMLInputElement;
    fireEvent.input(searchInput, { target: { value: "Frieren" } });

    const searchBtn = getByTestId("library-search-btn");
    fireEvent.click(searchBtn);

    expect(await findByText("Frieren")).toBeTruthy();
    const trackBtn = getByTestId("track-btn-100");
    expect(trackBtn).toBeTruthy();

    // Click track button
    fireEvent.click(trackBtn);
    expect(await findByText("✓ In Library")).toBeTruthy();
  });

  it("handles untrack, card click, and hover interactions", async () => {
    const { getByTestId, findByTestId } = render(() => <LibraryView />);

    const playBtn = await findByTestId("card-play-solo-leveling");
    fireEvent.click(playBtn);

    const untrackBtn = getByTestId("card-untrack-solo-leveling");
    fireEvent.click(untrackBtn);
  });
});
