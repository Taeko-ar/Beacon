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
    console.info(
      `[nyaa-api] Backend catalog search returned ${items.length} items`,
    );
    return items;
  }

  console.info(
    "[nyaa-api] Backend catalog search failed, attempting Jikan fallback...",
  );
  const jikanRes = await apiFetch<{
    data: Array<{
      mal_id: number;
      title_english?: string;
      title: string;
      images?: { jpg?: { image_url?: string } };
      synopsis?: string;
      genres?: Array<{ name: string }>;
    }>;
  }>(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}`);

  if (jikanRes.ok && jikanRes.data) {
    const results = (jikanRes.data.data || []).map((item) => ({
      id: String(item.mal_id),
      title: item.title_english || item.title,
      image_url: item.images?.jpg?.image_url,
      synopsis: item.synopsis,
      tags: item.genres?.map((g) => g.name) || [],
      is_torrenteable: true,
    }));
    console.info(
      `[nyaa-api] Jikan API fallback returned ${results.length} items`,
    );
    return results;
  }

  return [];
}
