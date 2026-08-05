import { apiFetch, apiFetchWithFallback } from "./apiFetch";

export interface TrackedShowItem {
  id: string;
  title: string;
  subgroup?: string;
  resolution?: string;
  lastDownloaded: number;
}

export interface NyaaRelease {
  title: string;
  magnet_link: string;
  subgroup?: string;
  resolution?: string;
  episode?: number;
}

export async function fetchTrackedShows(): Promise<TrackedShowItem[]> {
  const res = await apiFetchWithFallback<TrackedShowItem[]>("/api/track");
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

export async function addTrackedShow(show: TrackedShowItem): Promise<boolean> {
  const res = await apiFetchWithFallback<TrackedShowItem>("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(show),
  });
  return res.ok;
}

export async function removeTrackedShow(id: string): Promise<boolean> {
  const res = await apiFetchWithFallback<void>(
    `/api/track/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
  return res.ok;
}

export async function searchNyaaReleases(
  query: string,
): Promise<NyaaRelease[]> {
  const res = await apiFetchWithFallback<NyaaRelease[]>(
    `/api/search?q=${encodeURIComponent(query)}`,
  );
  return res.ok && res.data ? res.data : [];
}
