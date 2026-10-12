import { createSignal } from "solid-js";
import { apiFetchWithFallback } from "./api/apiFetch";

const key = (mediaId: number, episode: number) => `${mediaId}:${episode}`;

const [watched, setWatched] = createSignal<ReadonlySet<string>>(new Set());

export async function loadWatched(): Promise<void> {
  const res =
    await apiFetchWithFallback<{ media_id: number; episode: number }[]>(
      "/api/watched",
    );
  if (res.ok && Array.isArray(res.data)) {
    setWatched(new Set(res.data.map((w) => key(w.media_id, w.episode))));
  }
}

export const isWatched = (mediaId: number, episode: number) =>
  episode > 0 && watched().has(key(mediaId, episode));

export async function setEpisodeWatched(
  mediaId: number,
  episode: number,
  value: boolean,
): Promise<boolean> {
  const res = await apiFetchWithFallback("/api/watched", {
    method: value ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId, episode }),
  });
  if (!res.ok) return false;
  setWatched((prev) => {
    const next = new Set(prev);
    if (value) next.add(key(mediaId, episode));
    else next.delete(key(mediaId, episode));
    return next;
  });
  return true;
}
