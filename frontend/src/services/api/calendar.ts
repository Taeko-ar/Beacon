import { createSignal } from "solid-js";
import { apiFetch, apiFetchWithFallback } from "./apiFetch";

// Global bus — bumped whenever calendar data is force-refetched, so any
// mounted CalendarView knows to jump to today and reload.
const [_calendarRefreshTick, _setCalendarRefreshTick] = createSignal(0);
export const calendarRefreshTick = _calendarRefreshTick;
export function triggerCalendarRefresh() {
  _setCalendarRefreshTick((v) => v + 1);
}

interface CalendarChapter {
  number: number;
  title?: string;
  site: string;
  url: string;
}

export interface CalendarRelation {
  id: number;
  title: string;
  format: string;
  relation_type: string;
}

export interface CalendarEvent {
  id: number;
  media_id: number;
  title: string;
  title_romaji?: string;
  title_english?: string;
  airing_at: number;
  airing_at_art: string;
  release_date: string;
  episode: number;
  total_episodes?: number | null;
  mal_id?: number | null;
  description?: string;
  tags: string[];
  cover_image?: string;
  banner_image?: string;
  format: string;
  is_tracked: boolean;
  sources: string[];
  has_manga: boolean;
  chapters: CalendarChapter[];
  relations: CalendarRelation[];
}

// Premiere (ep 1) or finale (ep == total). Episode 0 = unknown.
export function releaseBadge(ev: CalendarEvent): "NEW" | "FINAL" | null {
  if (ev.episode === 1) return "NEW";
  if (ev.episode > 0 && ev.episode === ev.total_episodes) return "FINAL";
  return null;
}

// Direct MyAnimeList page when the id is known, title search otherwise.
export function malUrl(ev: CalendarEvent): string {
  return ev.mal_id
    ? `https://myanimelist.net/anime/${ev.mal_id}`
    : `https://myanimelist.net/anime.php?q=${encodeURIComponent(ev.title)}`;
}

// Related media has no MAL id from AniList: search by title, in MAL's manga
// section for print formats (manga, light novel, one-shot), anime otherwise.
export function relationMalUrl(rel: CalendarRelation): string {
  const print = ["MANGA", "NOVEL", "ONE_SHOT"].includes(
    rel.format.toUpperCase(),
  );
  return `https://myanimelist.net/${print ? "manga" : "anime"}.php?q=${encodeURIComponent(rel.title)}`;
}

export function ensureJKAnimeLink(event: CalendarEvent): CalendarEvent {
  const query = encodeURIComponent(event.title.toLowerCase());
  const jkUrl = `https://jkanime.net/buscar/${query}`;

  // Cached/legacy payloads may omit these arrays.
  const baseSources = event.sources ?? [];
  const baseChapters = event.chapters ?? [];
  const sources = baseSources.includes("JKAnime")
    ? baseSources
    : [...baseSources, "JKAnime"];

  const hasJkChapter = baseChapters.some((ch) => ch.site === "JKAnime");
  const chapters = hasJkChapter
    ? baseChapters.map((ch) =>
        ch.site === "JKAnime" ? { ...ch, url: jkUrl } : ch,
      )
    : [
        ...baseChapters,
        {
          number: event.episode,
          title: `Episode ${event.episode}`,
          site: "JKAnime",
          url: jkUrl,
        },
      ];

  return {
    ...event,
    sources,
    chapters,
  };
}

export async function fetchCalendarEvents(
  year: number,
  month: number,
): Promise<CalendarEvent[]> {
  const res = await apiFetchWithFallback<CalendarEvent[]>(
    `/api/calendar?year=${year}&month=${month}`,
  );

  if (res.ok && Array.isArray(res.data)) {
    return res.data.map(ensureJKAnimeLink);
  }

  return [];
}

export interface CalendarFetchStatus {
  active: boolean;
  year: number;
  month: number;
  source: string;
  page: number;
  last_page: number | null;
  events: number;
  rate_limited_secs: number | null;
  queued: number;
}

export async function fetchCalendarStatus(): Promise<CalendarFetchStatus | null> {
  const res = await apiFetchWithFallback<CalendarFetchStatus>(
    "/api/calendar/status",
  );
  return res.ok && res.data ? res.data : null;
}

export function formatFetchStatus(s: CalendarFetchStatus | null): string {
  if (!s?.active) return "Loading calendar events…";
  const month = String(s.month).padStart(2, "0");
  let text = `Fetching ${s.source} ${s.year}-${month}`;
  if (s.source === "AniList") {
    text += `: page ${s.page}/${s.last_page ?? "?"} (${s.events} events)`;
  }
  if (s.rate_limited_secs) {
    text += ` · rate-limited, retrying in ${s.rate_limited_secs}s`;
  }
  if (s.queued > 0) text += ` · ${s.queued} queued`;
  return text;
}

export async function clearCalendarCache(): Promise<boolean> {
  const res = await apiFetchWithFallback<void>("/api/calendar/cache", {
    method: "DELETE",
  });
  return res.ok;
}
