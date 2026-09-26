import { type Component, For, Show, createSignal } from "solid-js";
import {
  type CalendarEvent,
  ensureJKAnimeLink,
  malUrl,
  relationMalUrl,
  releaseBadge,
} from "../services/api/calendar";
import { copyText, descriptionToHtml } from "../services/format";
import { showToast } from "./Toast";

const isMainWatchSource = (site: string) => {
  const s = site.toLowerCase();
  return s === "jkanime" || s === "crunchyroll";
};

export const getModalMainWatchChapters = (ev: CalendarEvent | null) => {
  return ev ? ev.chapters.filter((ch) => isMainWatchSource(ch.site)) : [];
};

export const getModalOtherBadges = (ev: CalendarEvent | null) => {
  if (!ev) return [];

  const chapterBadges = ev.chapters
    .filter((ch) => !isMainWatchSource(ch.site))
    .map((ch) => ({ site: ch.site, url: ch.url }));

  const existingSites = new Set(chapterBadges.map((b) => b.site.toLowerCase()));
  const extraSources = (ev.sources || [])
    .filter(
      (s) =>
        !isMainWatchSource(s) &&
        !existingSites.has(s.toLowerCase()) &&
        s !== "MyAnimeList",
    )
    .map((s) => ({
      site: s,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${ev.title} ${s}`)}`,
    }));

  // Batch releases (whole season same day) merge N episodes into one event,
  // each carrying the same external links: keep one pill per site+url.
  const seen = new Set<string>();
  return [
    ...chapterBadges,
    ...extraSources,
    { site: "MyAnimeList", url: malUrl(ev) },
  ].filter((b) => {
    const key = `${b.site}|${b.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

interface ShowDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onTrackToggle?: (event: CalendarEvent) => Promise<void>;
  trackingInProgress?: boolean;
}

/* v8 ignore start */
export const ShowDetailModal: Component<ShowDetailModalProps> = (props) => {
  const [copySuccess, setCopySuccess] = createSignal(false);

  const handleCopyTitle = async (titleText: string) => {
    try {
      await copyText(titleText);
      setCopySuccess(true);
      showToast("Title copied to clipboard!", "success");
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      showToast("Failed to copy title", "error");
    }
  };

  const modalEvent = () =>
    props.event ? ensureJKAnimeLink(props.event) : null;

  return (
    <Show when={modalEvent()}>
      {(ev) => (
        <div
          data-testid="event-modal"
          class="event-modal-overlay"
          onClick={props.onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") {
              props.onClose();
            }
          }}
        >
          <div
            data-testid="event-modal-content"
            class="event-modal-content show-modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div class="show-modal-header">
              <div class="show-modal-title-wrap">
                <h3 class="event-modal-title">{ev().title}</h3>
                <button
                  type="button"
                  data-testid="copy-title-btn"
                  class="show-modal-icon-btn"
                  aria-label="Copy show name to clipboard"
                  title="Copy show name to clipboard"
                  onClick={() => handleCopyTitle(ev().title)}
                >
                  <Show
                    when={copySuccess()}
                    fallback={
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="12" height="12" rx="2" />
                        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                      </svg>
                    }
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </Show>
                </button>
              </div>
              <button
                type="button"
                data-testid="modal-close-btn"
                class="show-modal-icon-btn"
                aria-label="Close"
                onClick={props.onClose}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div class="show-modal-body">
              <aside class="show-modal-side">
                <Show
                  when={ev().cover_image}
                  fallback={<div class="show-modal-cover placeholder" />}
                >
                  <img
                    src={ev().cover_image}
                    alt={ev().title}
                    class="show-modal-cover"
                  />
                </Show>
                <Show when={getModalMainWatchChapters(ev()).length > 0}>
                  <div class="show-modal-watch-col">
                    <For each={getModalMainWatchChapters(ev())}>
                      {(ch) => (
                        <a
                          href={ch.url}
                          target="_blank"
                          rel="noreferrer"
                          data-testid={`chapter-link-${ch.number}`}
                          class="show-modal-watch"
                          title={`Watch episode ${ch.number} on ${ch.site}`}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7 5v14l12-7z" />
                          </svg>
                          <span>
                            Ep {ch.number} · {ch.site}
                          </span>
                        </a>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={props.onTrackToggle}>
                  <button
                    type="button"
                    data-testid={
                      ev().is_tracked ? "modal-untrack-btn" : "modal-track-btn"
                    }
                    disabled={props.trackingInProgress}
                    onClick={() => props.onTrackToggle?.(ev())}
                    class={`show-modal-track ${ev().is_tracked ? "btn-untrack" : "btn-track"}`}
                  >
                    {ev().is_tracked ? "Untrack" : "Track Show"}
                  </button>
                </Show>
                <dl class="show-modal-meta">
                  <div>
                    <dt>Airs</dt>
                    <dd>{ev().airing_at_art || "N/A"} ART</dd>
                  </div>
                  <Show when={ev().episode > 0}>
                    <div>
                      <dt>Episode</dt>
                      <dd>
                        {ev().episode}
                        {ev().total_episodes ? ` / ${ev().total_episodes}` : ""}
                        {releaseBadge(ev()) && (
                          <span
                            class={`release-badge ${releaseBadge(ev())?.toLowerCase()}`}
                            data-testid="release-badge"
                          >
                            {releaseBadge(ev())}
                          </span>
                        )}
                      </dd>
                    </div>
                  </Show>
                  <div>
                    <dt>Format</dt>
                    <dd>{ev().format}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd data-testid="modal-source">
                      {ev().has_manga ? "Manga" : "Original"}
                    </dd>
                  </div>
                  <Show when={ev().is_tracked}>
                    <div>
                      <dt>Status</dt>
                      <dd class="show-modal-tracked">Tracked</dd>
                    </div>
                  </Show>
                </dl>
              </aside>

              <div class="show-modal-main">
                <p
                  class="event-modal-desc-text"
                  innerHTML={
                    descriptionToHtml(ev().description) ||
                    "No description provided."
                  }
                />

                <Show when={ev().tags && ev().tags.length > 0}>
                  <div class="show-modal-tags">
                    <For each={ev().tags}>
                      {(tag) => <span class="show-modal-tag">{tag}</span>}
                    </For>
                  </div>
                </Show>

                <Show when={getModalOtherBadges(ev()).length > 0}>
                  <div class="show-modal-section">
                    <div class="show-modal-heading">Links</div>
                    <div class="show-modal-links">
                      <For each={getModalOtherBadges(ev())}>
                        {(badge) => (
                          <a
                            href={badge.url}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`source-badge-${badge.site.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                            class="show-modal-link"
                          >
                            {badge.site} ↗
                          </a>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <Show when={ev().relations && ev().relations.length > 0}>
                  <div class="show-modal-section">
                    <div class="show-modal-heading">Related</div>
                    <div class="show-modal-related">
                      <For each={ev().relations}>
                        {(rel) => (
                          <a
                            href={relationMalUrl(rel)}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`related-mal-link-${rel.id}`}
                            class="show-modal-related-row"
                            title={`Search "${rel.title}" on MyAnimeList`}
                          >
                            <span>{rel.title}</span>
                            <span class="show-modal-muted">
                              {rel.format} · {rel.relation_type.toLowerCase()} ↗
                            </span>
                          </a>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
/* v8 ignore stop */
