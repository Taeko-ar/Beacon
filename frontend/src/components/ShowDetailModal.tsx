/* v8 ignore start */
/* c8 ignore start */
import { type Component, For, Show, createSignal } from "solid-js";
import {
  type CalendarEvent,
  ensureJKAnimeLink,
} from "../services/api/calendar";
import { getModalMainWatchChapters, getModalOtherBadges } from "./CalendarView";
import { showToast } from "./Toast";

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
      await navigator.clipboard.writeText(titleText);
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
            class="event-modal-content"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div class="event-modal-top">
              <div class="event-modal-hero">
                {ev().cover_image && (
                  <img
                    src={ev().cover_image}
                    alt={ev().title}
                    class="event-modal-cover"
                  />
                )}
                <div>
                  <div class="event-modal-title-row">
                    <h3 class="event-modal-title">{ev().title}</h3>
                    <button
                      type="button"
                      data-testid="copy-title-btn"
                      class="btn-copy-title"
                      title="Copy show name to clipboard"
                      onClick={() => handleCopyTitle(ev().title)}
                    >
                      📋 {copySuccess() ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div class="event-modal-time">
                    Release Time (Argentina): {ev().airing_at_art || "N/A"}
                  </div>
                  <div class="event-modal-badges">
                    <span
                      class={`modal-badge ${ev().has_manga ? "manga-true" : "manga-false"}`}
                    >
                      {ev().has_manga
                        ? "Has Manga Adaptation"
                        : "Anime Only / Original"}
                    </span>
                    {ev().is_tracked && (
                      <span class="modal-badge tracked">✓ Tracked</span>
                    )}
                  </div>
                  {props.onTrackToggle && (
                    <div class="modal-action-row">
                      <button
                        type="button"
                        data-testid={
                          ev().is_tracked
                            ? "modal-untrack-btn"
                            : "modal-track-btn"
                        }
                        disabled={props.trackingInProgress}
                        onClick={() => props.onTrackToggle?.(ev())}
                        class={ev().is_tracked ? "btn-untrack" : "btn-track"}
                      >
                        {ev().is_tracked ? "Untrack" : "Track Show"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={props.onClose}
                class="btn-modal-close"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <div class="event-modal-section">
              <div class="event-modal-section-heading">Description</div>
              <p class="event-modal-desc-text">
                {ev().description || "No description provided."}
              </p>
            </div>

            {/* Genre Tags */}
            <Show when={ev().tags && ev().tags.length > 0}>
              <div class="event-modal-section">
                <div class="event-modal-section-heading">Tags / Genres</div>
                <div class="event-modal-tags-flex">
                  <For each={ev().tags}>
                    {(tag) => <span class="event-modal-tag-chip">{tag}</span>}
                  </For>
                </div>
              </div>
            </Show>

            {/* Episode Sources (JKAnime & Crunchyroll) */}
            <Show when={getModalMainWatchChapters(ev()).length > 0}>
              <div class="event-modal-section">
                <div class="event-modal-section-heading">
                  Episode Sources & Links
                </div>
                <div class="episode-sources-col">
                  <For each={getModalMainWatchChapters(ev())}>
                    {(ch) => (
                      <a
                        href={ch.url}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`chapter-link-${ch.number}`}
                        class="episode-source-card"
                      >
                        <span>
                          Episode {ch.number} - {ch.site}
                        </span>
                        <span>Watch →</span>
                      </a>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Other Media Badges */}
            <Show when={getModalOtherBadges(ev()).length > 0}>
              <div class="event-modal-section">
                <div class="event-modal-section-heading">
                  Other Media & Links
                </div>
                <div class="other-sources-badges-row">
                  <For each={getModalOtherBadges(ev())}>
                    {(badge) => (
                      <a
                        href={badge.url}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`source-badge-${badge.site.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                        class="site-badge-pill"
                      >
                        {badge.site} ↗
                      </a>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Related Seasons / OVAs */}
            <Show when={ev().relations && ev().relations.length > 0}>
              <div>
                <div class="event-modal-section-heading">
                  Related Seasons & Media
                </div>
                <div class="relations-col">
                  <For each={ev().relations}>
                    {(rel) => (
                      <div class="relation-card">
                        <span>{rel.title}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {rel.relation_type} ({rel.format})
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};
/* v8 ignore stop */
/* c8 ignore stop */
