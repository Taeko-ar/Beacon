import {
  type Component,
  For,
  Show,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import {
  type CalendarEvent,
  fetchCalendarEvents,
} from "../services/api/calendar";
import { type CatalogItem, searchCatalog } from "../services/api/nyaa";
import {
  type TrackedShowItem,
  addTrackedShow,
  fetchTrackedShows,
  removeTrackedShow,
} from "../services/api/tracking";
import { descriptionToHtml } from "../services/format";
import { ShowDetailModal } from "./ShowDetailModal";
import { showToast } from "./Toast";
import "./LibraryView.css";

interface LibraryShowItem extends TrackedShowItem {
  image_url?: string;
  synopsis?: string;
  tags?: string[];
  year?: number | string;
  seasonsCount?: number;
  calendarEvent?: CalendarEvent;
}

export const LibraryView: Component = () => {
  const [trackedShows, setTrackedShows] = createSignal<TrackedShowItem[]>([]);
  const [calendarEvents, setCalendarEvents] = createSignal<CalendarEvent[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Search state
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<CatalogItem[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [hasSearched, setHasSearched] = createSignal(false);

  // Hover state for search list & library cards
  const [hoveredSearchItem, setHoveredSearchItem] = createSignal<{
    item: CatalogItem;
    x: number;
    y: number;
  } | null>(null);

  // Modal detail state
  const [activeModalEvent, setActiveModalEvent] =
    createSignal<CalendarEvent | null>(null);
  const [trackingInProgress, setTrackingInProgress] = createSignal(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [shows, cal] = await Promise.all([
        fetchTrackedShows().catch(() => []),
        fetchCalendarEvents(year, month).catch(() => []),
      ]);

      setTrackedShows(shows);
      setCalendarEvents(cal);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    loadData();
  });

  // Convert tracked shows into library items with metadata & cover images
  const libraryItems = createMemo<LibraryShowItem[]>(() => {
    const cal = calendarEvents();
    return trackedShows().map((show) => {
      const lower = show.title.toLowerCase();
      const matched = cal.find((ev) => {
        const tLower = ev.title.toLowerCase();
        const engLower = ev.title_english?.toLowerCase();
        const romLower = ev.title_romaji?.toLowerCase();
        return (
          tLower === lower ||
          (engLower && engLower === lower) ||
          (romLower && romLower === lower) ||
          tLower.includes(lower) ||
          lower.includes(tLower)
        );
      });

      const cover = show.cover_image || matched?.cover_image;
      const synopsis =
        show.synopsis ||
        matched?.description ||
        `Tracked show with quality ${show.resolution || "1080p"} and release subgroup ${show.subgroup || "Any"}.`;
      const tags =
        show.tags && show.tags.length > 0
          ? show.tags
          : matched?.tags && matched.tags.length > 0
            ? matched.tags
            : ["Anime"];
      const year =
        show.year ||
        (matched?.release_date ? matched.release_date.slice(0, 4) : 2026);

      return {
        ...show,
        image_url: cover,
        synopsis,
        tags,
        year,
        seasonsCount:
          matched?.relations && matched.relations.length > 0
            ? matched.relations.length + 1
            : 1,
        calendarEvent: matched
          ? { ...matched, is_tracked: true }
          : cover
            ? {
                id: Math.abs(
                  show.title
                    .split("")
                    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
                ),
                media_id: 0,
                title: show.title,
                airing_at: 0,
                airing_at_art: "Available on Library",
                release_date: `${year}-01-01`,
                episode: 1,
                description: synopsis,
                tags,
                cover_image: cover,
                format: "TV",
                is_tracked: true,
                sources: ["Crunchyroll", "JKAnime"],
                has_manga: false,
                chapters: [],
                relations: [],
              }
            : undefined,
      };
    });
  });

  const handleSearchSubmit = async (e: Event) => {
    e.preventDefault();
    const query = searchQuery().trim();
    if (!query) return;

    setSearching(true);
    setHasSearched(true);
    try {
      const results = await searchCatalog(query);
      setSearchResults(results);
    } catch {
      showToast("Error searching anime catalog", "error");
    } finally {
      setSearching(false);
    }
  };

  const isTracked = (title: string) => {
    const lower = title.toLowerCase();
    return trackedShows().some(
      (s) =>
        s.title.toLowerCase() === lower ||
        s.id.toLowerCase() === lower.replace(/\s+/g, "-"),
    );
  };

  const handleTrackAnime = async (item: CatalogItem) => {
    setTrackingInProgress(true);
    try {
      const newShow: TrackedShowItem = {
        id: item.title.toLowerCase().replace(/\s+/g, "-"),
        title: item.title,
        subgroup: "SubsPlease",
        resolution: "1080p",
        lastDownloaded: 0,
        cover_image: item.image_url,
        synopsis: item.synopsis,
        tags: item.tags,
        year: 2026,
      };

      const ok = await addTrackedShow(newShow);
      if (ok) {
        showToast(`Added ${item.title} to Library!`, "success");
        setTrackedShows((prev) => [...prev, newShow]);
        loadData();
      } else {
        showToast("Failed to add anime to Library", "error");
      }
    } catch {
      showToast("Failed to track anime", "error");
    } finally {
      setTrackingInProgress(false);
    }
  };

  const handleUntrackAnime = async (title: string) => {
    setTrackingInProgress(true);
    try {
      const defaultId = title.toLowerCase().replace(/\s+/g, "-");
      const found = trackedShows().find(
        (s) =>
          s.title.toLowerCase() === title.toLowerCase() || s.id === defaultId,
      );
      const idToRemove = found ? found.id : defaultId;

      const ok = await removeTrackedShow(idToRemove);
      if (ok) {
        showToast(`Removed ${title} from Library`, "success");
        setTrackedShows((prev) => prev.filter((s) => s.id !== idToRemove));
        if (activeModalEvent()?.title.toLowerCase() === title.toLowerCase()) {
          setActiveModalEvent(null);
        }
      } else {
        showToast("Failed to remove anime", "error");
      }
    } catch {
      showToast("Failed to untrack anime", "error");
    } finally {
      setTrackingInProgress(false);
    }
  };

  const openShowDetail = (show: LibraryShowItem) => {
    if (show.calendarEvent) {
      setActiveModalEvent(show.calendarEvent);
    } else {
      const fallbackEvent: CalendarEvent = {
        id: Math.abs(
          show.title.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
        ),
        media_id: 0,
        title: show.title,
        airing_at: 0,
        airing_at_art: "Available on Library",
        release_date: `${show.year || 2026}-01-01`,
        episode: 1,
        description: show.synopsis,
        tags: show.tags || [],
        cover_image: show.image_url,
        format: "TV",
        is_tracked: true,
        sources: ["Crunchyroll", "JKAnime"],
        has_manga: false,
        chapters: [],
        relations: [],
      };
      setActiveModalEvent(fallbackEvent);
    }
  };

  const handleSearchHover = (e: MouseEvent, item: CatalogItem) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoveredSearchItem({
      item,
      x: rect.right + 12,
      y: rect.top,
    });
  };

  return (
    <div class="library-container" data-testid="library-view">
      {/* ── Section 1: Search & Add Anime from Any Season/Source ────── */}
      <section class="library-section" data-testid="library-search-section">
        <div class="library-section-header">
          <h2 class="library-section-title">Search & Add Anime</h2>
          <span class="library-section-subtitle">
            Find any anime across all seasons and sources to add to your library
          </span>
        </div>

        <form onSubmit={handleSearchSubmit} class="library-search-form">
          <input
            type="text"
            data-testid="library-search-input"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search anime across all seasons (e.g. Frieren, Naruto, Bleach, Oshi no Ko)..."
            class="library-search-input"
          />
          <button
            type="submit"
            data-testid="library-search-btn"
            disabled={searching()}
            class="library-search-btn"
          >
            {searching() ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Search Results List */}
        <Show when={hasSearched()}>
          <div
            class="library-search-results"
            data-testid="library-search-results"
          >
            <Show
              when={!searching()}
              fallback={
                <div class="loading-container">
                  <div class="spinner" />
                  <span>Searching catalog...</span>
                </div>
              }
            >
              <For
                each={searchResults()}
                fallback={
                  <div
                    class="library-empty-search"
                    data-testid="library-search-empty"
                  >
                    No anime found matching your query.
                  </div>
                }
              >
                {(item) => {
                  const tracked = () => isTracked(item.title);
                  return (
                    <div
                      class="library-search-item"
                      data-testid={`search-item-${item.id}`}
                      onMouseEnter={(e) => handleSearchHover(e, item)}
                      onMouseLeave={() => setHoveredSearchItem(null)}
                    >
                      <div class="library-search-item-info">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.title}
                            class="library-search-thumb"
                          />
                        ) : (
                          <div class="library-search-thumb-placeholder">🎬</div>
                        )}
                        <div>
                          <div class="library-search-item-title">
                            {item.title}
                          </div>
                          <div class="library-search-item-tags">
                            <For each={(item.tags || []).slice(0, 3)}>
                              {(tag) => (
                                <span class="library-tag-chip">{tag}</span>
                              )}
                            </For>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid={`track-btn-${item.id}`}
                        disabled={trackingInProgress()}
                        class={`library-action-btn ${tracked() ? "tracked" : "track"}`}
                        onClick={() =>
                          tracked()
                            ? handleUntrackAnime(item.title)
                            : handleTrackAnime(item)
                        }
                      >
                        {tracked() ? "✓ In Library" : "+ Add to Library"}
                      </button>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </Show>
      </section>

      {/* ── Section 2: Library Grid (Top Picks / Tracked Shows) ──────── */}
      <section class="library-section" data-testid="library-grid-section">
        <div class="library-section-header">
          <h2 class="library-section-title">Top Picks for You</h2>
          <span class="library-section-subtitle">
            Your saved anime collection with quick-links, episode tracking, and
            metadata
          </span>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="loading-container" data-testid="loading-spinner">
              <div class="spinner spinner-lg" />
              <span>Loading your anime library...</span>
            </div>
          }
        >
          <div class="library-grid" data-testid="library-grid">
            <For
              each={libraryItems()}
              fallback={
                <div
                  class="library-empty-grid"
                  data-testid="library-grid-empty"
                >
                  No anime in your library yet. Search and add your favorite
                  shows above!
                </div>
              }
            >
              {(show) => (
                <div
                  class="library-card"
                  data-testid={`library-card-${show.id}`}
                >
                  <div class="library-card-poster-wrap">
                    <button
                      type="button"
                      class="library-card-click-area"
                      onClick={() => openShowDetail(show)}
                      aria-label={`View details for ${show.title}`}
                    >
                      {show.image_url ? (
                        <img
                          src={show.image_url}
                          alt={show.title}
                          class="library-card-poster"
                        />
                      ) : (
                        <div class="library-card-poster-fallback">
                          <span class="fallback-icon">🎬</span>
                          <span class="fallback-title">{show.title}</span>
                        </div>
                      )}
                    </button>

                    {/* Bookmark Badge */}
                    <div class="library-card-bookmark">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="currentColor"
                      >
                        <title>Tracked</title>
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>

                    {/* Hover Overlay with Description, Year, Seasons, Tags, Action Buttons */}
                    <div
                      class="library-card-hover-overlay"
                      data-testid={`card-hover-${show.id}`}
                    >
                      <div class="overlay-header">
                        <div class="overlay-title">{show.title}</div>
                        <div class="overlay-meta">
                          <span class="overlay-rating">★ 4.8</span>
                          <span class="overlay-dot">•</span>
                          <span>{show.year || 2026}</span>
                          <span class="overlay-dot">•</span>
                          <span>
                            {show.seasonsCount || 1} Season
                            {show.seasonsCount && show.seasonsCount > 1
                              ? "s"
                              : ""}
                          </span>
                        </div>
                      </div>

                      <p
                        class="overlay-desc"
                        innerHTML={
                          descriptionToHtml(show.synopsis) ||
                          "No description provided for this show."
                        }
                      />

                      <div class="overlay-tags">
                        <For each={(show.tags || []).slice(0, 3)}>
                          {(tag) => <span class="overlay-tag-pill">{tag}</span>}
                        </For>
                      </div>

                      {/* Action buttons: Play/Watch, Save/Bookmark, Untrack */}
                      <div
                        class="overlay-actions"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          class="overlay-action-btn play"
                          title="Watch / Details"
                          data-testid={`card-play-${show.id}`}
                          onClick={() => openShowDetail(show)}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="currentColor"
                          >
                            <title>Play</title>
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          class="overlay-action-btn save"
                          title="Direct Watch Search"
                          data-testid={`card-save-${show.id}`}
                          onClick={() => {
                            window.open(
                              `https://jkanime.net/buscar/${encodeURIComponent(show.title.toLowerCase())}`,
                              "_blank",
                            );
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <title>Bookmark</title>
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          class="overlay-action-btn untrack"
                          title="Remove from Library"
                          data-testid={`card-untrack-${show.id}`}
                          onClick={() => handleUntrackAnime(show.title)}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <title>Remove</title>
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Meta (Title & Sub/Dub Tag) */}
                  <div class="library-card-info">
                    <div class="library-card-title" title={show.title}>
                      {show.title}
                    </div>
                    <div class="library-card-subdub">Sub | Dub</div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      {/* Search Result Tooltip Hover (matches Library hover) */}
      <Show when={hoveredSearchItem()}>
        {(info) => (
          <div
            data-testid="search-hover-tooltip"
            class="event-tooltip library-search-tooltip"
            style={{
              left: `${Math.min(info().x, window.innerWidth - 270)}px`,
              top: `${Math.min(info().y, window.innerHeight - 220)}px`,
            }}
          >
            <div class="tooltip-header">
              {info().item.image_url && (
                <img
                  src={info().item.image_url}
                  alt={info().item.title}
                  class="tooltip-cover"
                />
              )}
              <div>
                <div class="tooltip-title">{info().item.title}</div>
                <div class="tooltip-time">All Seasons Catalog</div>
              </div>
            </div>
            <div
              class="tooltip-desc"
              innerHTML={
                descriptionToHtml(info().item.synopsis) ||
                "No description provided."
              }
            />
            <div class="tooltip-tags">
              <For each={(info().item.tags || []).slice(0, 3)}>
                {(tag) => <span class="tooltip-tag-pill">{tag}</span>}
              </For>
            </div>
          </div>
        )}
      </Show>

      {/* Show Details Modal */}
      <ShowDetailModal
        event={activeModalEvent()}
        onClose={() => setActiveModalEvent(null)}
        onTrackToggle={async (ev) => {
          if (ev.is_tracked) {
            await handleUntrackAnime(ev.title);
          } else {
            await handleTrackAnime({
              id: String(ev.id),
              title: ev.title,
              image_url: ev.cover_image,
              synopsis: ev.description,
              tags: ev.tags,
            });
          }
        }}
        trackingInProgress={trackingInProgress()}
      />
    </div>
  );
};
