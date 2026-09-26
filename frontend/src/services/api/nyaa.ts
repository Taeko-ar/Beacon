import { apiFetch, apiFetchWithFallback } from "./apiFetch";

export interface CatalogItem {
  id: string;
  title: string;
  image_url?: string;
  synopsis?: string;
  tags?: string[];
  is_torrenteable?: boolean;
}

export async function searchCatalog(
  query: string,
  page = 1,
): Promise<CatalogItem[]> {
  console.info(
    `[nyaa-api] searchCatalog triggering search endpoint for query: "${query}" (page ${page})`,
  );

  const res = await apiFetchWithFallback<
    CatalogItem[] | { items: CatalogItem[] }
  >(`/api/catalog/search?q=${encodeURIComponent(query)}&page=${page}`);

  if (res.ok && res.data) {
    const items: CatalogItem[] = Array.isArray(res.data)
      ? res.data
      : (res.data as { items: CatalogItem[] }).items || [];
    if (items.length > 0) {
      console.info(
        `[nyaa-api] Backend catalog search returned ${items.length} items`,
      );
      return items;
    }
  }

  console.info(
    "[nyaa-api] Backend search empty, attempting Jikan & Kitsu fallback...",
  );

  // 1. Try Jikan
  const jikanRes = await apiFetch<{
    data?: Array<{
      mal_id?: number;
      title_english?: string;
      title?: string;
      images?: { jpg?: { image_url?: string } };
      synopsis?: string;
      genres?: Array<{ name: string }>;
    }>;
  }>(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}`);

  if (jikanRes.ok && jikanRes.data?.data && Array.isArray(jikanRes.data.data)) {
    const results = jikanRes.data.data.map((item) => ({
      id: String(item.mal_id || ""),
      title: item.title_english || item.title || "Unknown",
      image_url: item.images?.jpg?.image_url,
      synopsis: item.synopsis,
      tags: item.genres?.map((g) => g.name) || [],
      is_torrenteable: true,
    }));
    if (results.length > 0) {
      console.info(
        `[nyaa-api] Jikan API fallback returned ${results.length} items`,
      );
      return results;
    }
  }

  // 2. Try Kitsu
  const kitsuRes = await apiFetch<{
    data?: Array<{
      id: string;
      attributes?: {
        canonicalTitle?: string;
        titles?: { en?: string };
        posterImage?: { medium?: string; original?: string };
        synopsis?: string;
      };
    }>;
  }>(
    `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=20`,
  );

  if (kitsuRes.ok && kitsuRes.data?.data && Array.isArray(kitsuRes.data.data)) {
    const results = kitsuRes.data.data.map((item) => ({
      id: item.id,
      title:
        item.attributes?.canonicalTitle ||
        item.attributes?.titles?.en ||
        "Unknown",
      image_url:
        item.attributes?.posterImage?.medium ||
        item.attributes?.posterImage?.original,
      synopsis: item.attributes?.synopsis,
      tags: ["Anime"],
      is_torrenteable: true,
    }));
    console.info(
      `[nyaa-api] Kitsu API fallback returned ${results.length} items`,
    );
    return results;
  }

  return [];
}
