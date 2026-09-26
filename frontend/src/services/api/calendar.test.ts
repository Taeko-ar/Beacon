import { describe, expect, it, vi } from "vitest";
import * as apiFetchModule from "./apiFetch";
import {
  type CalendarEvent,
  clearCalendarCache,
  ensureJKAnimeLink,
  fetchCalendarEvents,
  formatFetchStatus,
  relationMalUrl,
  releaseBadge,
} from "./calendar";

describe("calendar API module", () => {
  it("relationMalUrl searches MAL manga for print formats, anime otherwise", () => {
    const rel = (format: string) => ({
      id: 1,
      title: "Sword & Co",
      format,
      relation_type: "PREQUEL",
    });
    expect(relationMalUrl(rel("NOVEL"))).toBe(
      "https://myanimelist.net/manga.php?q=Sword%20%26%20Co",
    );
    expect(relationMalUrl(rel("MANGA"))).toBe(
      "https://myanimelist.net/manga.php?q=Sword%20%26%20Co",
    );
    expect(relationMalUrl(rel("ONA"))).toBe(
      "https://myanimelist.net/anime.php?q=Sword%20%26%20Co",
    );
    expect(relationMalUrl(rel(""))).toBe(
      "https://myanimelist.net/anime.php?q=Sword%20%26%20Co",
    );
  });

  it("formatFetchStatus describes backend fetch progress", () => {
    const base = {
      active: true,
      year: 2026,
      month: 9,
      source: "AniList",
      page: 12,
      last_page: 48,
      events: 550,
      rate_limited_secs: null,
      queued: 0,
    };
    expect(formatFetchStatus(null)).toBe("Loading calendar events…");
    expect(formatFetchStatus({ ...base, active: false })).toBe(
      "Loading calendar events…",
    );
    expect(formatFetchStatus(base)).toBe(
      "Fetching AniList 2026-09: page 12/48 (550 events)",
    );
    expect(
      formatFetchStatus({
        ...base,
        last_page: null,
        rate_limited_secs: 30,
        queued: 2,
      }),
    ).toBe(
      "Fetching AniList 2026-09: page 12/? (550 events) · rate-limited, retrying in 30s · 2 queued",
    );
    expect(formatFetchStatus({ ...base, source: "MyAnimeList" })).toBe(
      "Fetching MyAnimeList 2026-09",
    );
  });

  it("releaseBadge flags premiere and finale episodes", () => {
    const ev = (episode: number, total_episodes?: number | null) =>
      ({ episode, total_episodes }) as CalendarEvent;
    expect(releaseBadge(ev(1, 12))).toBe("NEW");
    expect(releaseBadge(ev(1))).toBe("NEW");
    expect(releaseBadge(ev(12, 12))).toBe("FINAL");
    expect(releaseBadge(ev(5, 12))).toBeNull();
    expect(releaseBadge(ev(5, null))).toBeNull();
    expect(releaseBadge(ev(0, 0))).toBeNull();
  });

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
