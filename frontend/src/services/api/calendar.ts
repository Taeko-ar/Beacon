import { apiFetch, apiFetchWithFallback } from "./apiFetch";

interface CalendarChapter {
  number: number;
  title?: string;
  site: string;
  url: string;
}

interface CalendarRelation {
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

export function ensureJKAnimeLink(event: CalendarEvent): CalendarEvent {
  const query = encodeURIComponent(event.title.toLowerCase());
  const jkUrl = `https://jkanime.net/buscar/${query}`;

  const sources = event.sources.includes("JKAnime")
    ? event.sources
    : [...event.sources, "JKAnime"];

  const hasJkChapter = event.chapters.some((ch) => ch.site === "JKAnime");
  const chapters = hasJkChapter
    ? event.chapters.map((ch) =>
        ch.site === "JKAnime" ? { ...ch, url: jkUrl } : ch,
      )
    : [
        ...event.chapters,
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

export async function clearCalendarCache(): Promise<boolean> {
  const res = await apiFetchWithFallback<void>("/api/calendar/cache", {
    method: "DELETE",
  });
  return res.ok;
}
