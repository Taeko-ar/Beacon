import { describe, expect, it, vi } from "vitest";
import * as apiFetchModule from "./apiFetch";
import {
  clearCalendarCache,
  ensureJKAnimeLink,
  fetchCalendarEvents,
} from "./calendar";

describe("calendar API module", () => {
  it("ensureJKAnimeLink constructs correct search URL and adds source/chapter", () => {
    const mockEvent = {
      id: 1,
      media_id: 10,
      title: "Kimetsu no Yaiba",
      airing_at: 1700000000,
      airing_at_art: "12:00",
      release_date: "2026-07-30",
      episode: 5,
      tags: [],
      format: "TV",
      is_tracked: false,
      sources: ["Crunchyroll"],
      has_manga: true,
      chapters: [
        {
          number: 5,
          site: "Crunchyroll",
          url: "https://crunchyroll.com/kimetsu",
        },
      ],
      relations: [],
    };

    const res = ensureJKAnimeLink(mockEvent);
    expect(res.sources).toContain("JKAnime");
    expect(res.chapters.length).toBe(2);
    expect(res.chapters[1].url).toBe(
      "https://jkanime.net/buscar/kimetsu%20no%20yaiba",
    );

    // Test branch where JKAnime is already in sources and chapters
    const eventWithJK = {
      ...res,
      chapters: [
        ...res.chapters,
        {
          number: 5,
          site: "JKAnime",
          url: "https://jkanime.net/old",
        },
      ],
    };
    const res2 = ensureJKAnimeLink(eventWithJK);
    expect(res2.sources).toContain("JKAnime");
    const jkCh = res2.chapters.find((c) => c.site === "JKAnime");
    expect(jkCh?.url).toBe("https://jkanime.net/buscar/kimetsu%20no%20yaiba");
  });

  it("fetchCalendarEvents returns formatted events on success and empty array on failure", async () => {
    vi.spyOn(apiFetchModule, "apiFetchWithFallback").mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 1,
          media_id: 10,
          title: "Bleach",
          airing_at: 1700000000,
          airing_at_art: "12:00",
          release_date: "2026-07-30",
          episode: 1,
          tags: [],
          format: "TV",
          is_tracked: false,
          sources: [],
          has_manga: false,
          chapters: [],
          relations: [],
        },
      ],
    });

    const events = await fetchCalendarEvents(2026, 7);
    expect(events.length).toBe(1);
    expect(events[0].chapters[0].url).toBe("https://jkanime.net/buscar/bleach");

    vi.spyOn(apiFetchModule, "apiFetchWithFallback").mockResolvedValueOnce({
      ok: false,
      error: "FAIL",
    });

    const empty = await fetchCalendarEvents(2026, 7);
    expect(empty).toEqual([]);
  });

  it("clearCalendarCache sends DELETE request and returns boolean result", async () => {
    vi.spyOn(apiFetchModule, "apiFetchWithFallback").mockResolvedValueOnce({
      ok: true,
    });

    const result = await clearCalendarCache();
    expect(result).toBe(true);
  });
});
