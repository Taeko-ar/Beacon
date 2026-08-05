/* v8 ignore start */
/* c8 ignore start */
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import {
  type CalendarEvent,
  fetchCalendarEvents,
} from "../services/api/calendar";
import {
  type NyaaRelease,
  type TrackedShowItem,
  addTrackedShow,
  fetchTrackedShows,
  removeTrackedShow,
  searchNyaaReleases,
} from "../services/api/tracking";
import { ShowDetailModal } from "./ShowDetailModal";
import "./TrackedShows.css";

export type { TrackedShowItem };

const AVAILABLE_SOURCES = [
  "Crunchyroll",
  "JKAnime",
  "Netflix",
  "Funimation",
  "Disney+",
  "HIDIVE",
];

interface TrackedShowWithEvent extends TrackedShowItem {
  calendarEvent?: CalendarEvent;
  nextEpisodeStr?: string;
}

/* v8 ignore start */
export function formatNextEpisodeDate(ev?: CalendarEvent): string {
  if (!ev) return "No scheduled release";
  const ep = ev.episode ? `Ep ${ev.episode}: ` : "";

  if (ev.airing_at) {
    const d = new Date(ev.airing_at * 1000);
    const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
    const monthName = d.toLocaleDateString("en-US", { month: "long" });
    const dayNum = d.getDate();
    const year = d.getFullYear();
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${ep}${dayName}, ${monthName} ${dayNum}, ${year} at ${timeStr} (ART)`;
  }

  if (ev.airing_at_art) {
    const match = ev.airing_at_art.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}))?/,
    );
    if (match) {
      const [_, y, m, dNum, timeStr] = match;
      const dateObj = new Date(Number(y), Number(m) - 1, Number(dNum));
      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const monthName = dateObj.toLocaleDateString("en-US", { month: "long" });
      const timePart = timeStr ? ` at ${timeStr} (ART)` : "";
      return `${ep}${dayName}, ${monthName} ${Number(dNum)}, ${y}${timePart}`;
    }
    return `${ep}${ev.airing_at_art}`;
  }

  if (ev.release_date) {
    const match = ev.release_date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [_, y, m, dNum] = match;
      const dateObj = new Date(Number(y), Number(m) - 1, Number(dNum));
      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const monthName = dateObj.toLocaleDateString("en-US", { month: "long" });
      return `${ep}${dayName}, ${monthName} ${Number(dNum)}, ${y}`;
    }
    return `${ep}${ev.release_date}`;
  }

  return "No scheduled release";
}

export const TrackedShows: Component = () => {
  const [shows, setShows] = createSignal<TrackedShowItem[]>([]);
  const [calendarEvents, setCalendarEvents] = createSignal<CalendarEvent[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Filters (matching CalendarView style)
  const [filterName, setFilterName] = createSignal("");
  const [showFilterPopover, setShowFilterPopover] = createSignal(false);
  const [selectedSources, setSelectedSources] = createSignal<string[]>([]);
  const [filterFormat, setFilterFormat] = createSignal<
    "all" | "anime" | "manga"
  >("all");
  const [filterStatus, setFilterStatus] = createSignal<
    "all" | "upcoming" | "active"
  >("all");

  // Show Details Modal State
  const [activeModalEvent, setActiveModalEvent] =
    createSignal<CalendarEvent | null>(null);
  const [trackingInProgress, setTrackingInProgress] = createSignal(false);

  // Add / Search Show Modal State
  const [showAddModal, setShowAddModal] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [subgroup, setSubgroup] = createSignal("SubsPlease");
  const [resolution, setResolution] = createSignal("1080p");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<NyaaRelease[]>([]);
  const [searching, setSearching] = createSignal(false);

  const fetchShowsAndCalendar = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      let nextMonth = currentMonth + 1;
      let nextYear = currentYear;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear = currentYear + 1;
      }

      let prevMonth = currentMonth - 1;
      let prevYear = currentYear;
      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear = currentYear - 1;
      }

      const [showData, prevCal, currentCal, nextCal] = await Promise.all([
        fetchTrackedShows().catch(() => []),
        fetchCalendarEvents(prevYear, prevMonth).catch(() => []),
        fetchCalendarEvents(currentYear, currentMonth).catch(() => []),
        fetchCalendarEvents(nextYear, nextMonth).catch(() => []),
      ]);

      const combinedCal = [...prevCal, ...currentCal, ...nextCal];
      setShows(showData);
      setCalendarEvents(combinedCal);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    fetchShowsAndCalendar();
  });

  const handleAddShow = async (e: Event) => {
    e.preventDefault();
    if (!title()) return;

    const sg = subgroup().trim();
    const resVal = resolution().trim();
    const newShow: TrackedShowItem = {
      id: title().toLowerCase().replace(/\s+/g, "-"),
      title: title(),
      subgroup: sg ? sg : undefined,
      resolution: resVal ? resVal : undefined,
      lastDownloaded: 0,
    };

    const ok = await addTrackedShow(newShow);
    if (ok) {
      setShows((prev) => [...prev, newShow]);
      setTitle("");
      setShowAddModal(false);
      fetchShowsAndCalendar();
    }
  };

  const handleRemoveShow = async (id: string) => {
    const ok = await removeTrackedShow(id);
    if (ok) {
      fetchShowsAndCalendar();
    }
  };

  const handleSearch = async (e: Event) => {
    e.preventDefault();
    if (!searchQuery()) return;
    setSearching(true);
    try {
      const data = await searchNyaaReleases(searchQuery());
      setSearchResults(data);
    } finally {
      setSearching(false);
    }
  };

  const handleTrackFromSearch = (result: NyaaRelease) => {
    let cleanTitle = result.title;
    cleanTitle = cleanTitle.replace(/^\[.*?\]\s*/, "");
    cleanTitle = cleanTitle.replace(/\s*-\s*\d+.*$/, "");
    cleanTitle = cleanTitle.replace(/\s*\(1080p|720p|480p|2160p\).*$/, "");
    cleanTitle = cleanTitle.trim();

    setTitle(cleanTitle);
    setSubgroup(result.subgroup || "");
    setResolution(result.resolution || "1080p");
  };

  // Match tracked show to calendar event (preferring future upcoming episodes)
  const findCalendarEventForShow = (
    show: TrackedShowItem,
  ): CalendarEvent | undefined => {
    const showTitleLower = show.title.toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);

    const matches = calendarEvents().filter((ev) => {
      const tLower = ev.title.toLowerCase();
      const engLower = ev.title_english?.toLowerCase();
      const romLower = ev.title_romaji?.toLowerCase();
      return (
        tLower === showTitleLower ||
        (engLower && engLower === showTitleLower) ||
        (romLower && romLower === showTitleLower) ||
        tLower.includes(showTitleLower) ||
        showTitleLower.includes(tLower)
      );
    });

    if (matches.length === 0) return undefined;

    // Filter upcoming events (airing_at in the future)
    const upcoming = matches
      .filter((ev) => ev.airing_at > 0 && ev.airing_at >= nowSec)
      .sort((a, b) => a.airing_at - b.airing_at);

    if (upcoming.length > 0) {
      return upcoming[0];
    }

    // Otherwise sort descending by airing_at (most recent)
    return [...matches].sort((a, b) => b.airing_at - a.airing_at)[0];
  };

  // Process shows with next episode dates
  const enrichedShows = createMemo<TrackedShowWithEvent[]>(() => {
    return shows().map((show) => {
      const matchedEv = findCalendarEventForShow(show);
      const nextEpisodeStr = formatNextEpisodeDate(matchedEv);

      return {
        ...show,
        calendarEvent: matchedEv
          ? { ...matchedEv, is_tracked: true }
          : undefined,
        nextEpisodeStr,
      };
    });
  });

  // Filtered shows list
  const filteredShows = createMemo(() => {
    const query = filterName().toLowerCase().trim();
    const sources = selectedSources();
    const fmt = filterFormat();
    const status = filterStatus();

    return enrichedShows().filter((show) => {
      // Text match
      if (query && !show.title.toLowerCase().includes(query)) {
        return false;
      }

      const ev = show.calendarEvent;

      // Source filter
      if (sources.length > 0) {
        if (!ev || !ev.sources) return false;
        const hasSource = sources.some((src) =>
          ev.sources.map((s) => s.toLowerCase()).includes(src.toLowerCase()),
        );
        if (!hasSource) return false;
      }

      // Format filter
      if (fmt !== "all") {
        if (!ev) return false;
        const isManga = ev.has_manga;
        if (fmt === "manga" && !isManga) return false;
        if (fmt === "anime" && isManga) return false;
      }

      // Status filter
      if (status !== "all") {
        if (status === "upcoming") {
          if (!ev || show.nextEpisodeStr === "No scheduled release")
            return false;
        }
      }

      return true;
    });
  });

  const toggleSourceFilter = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source],
    );
  };

  const handleOpenDetailModal = (show: TrackedShowWithEvent) => {
    if (show.calendarEvent) {
      setActiveModalEvent(show.calendarEvent);
    } else {
      // Create fallback event for detail modal
      const fallbackEvent: CalendarEvent = {
        id: Math.abs(
          show.title.split("").reduce((a, b) => a + b.charCodeAt(0), 0),
        ),
        media_id: 0,
        title: show.title,
        airing_at: 0,
        airing_at_art: show.nextEpisodeStr || "N/A",
        release_date: "",
        episode: show.lastDownloaded + 1,
        description: `Tracked anime show (Subgroup: ${show.subgroup || "Any"}, Quality: ${show.resolution || "1080p"}).`,
        tags: [],
        format: "TV",
        is_tracked: true,
        sources: ["Crunchyroll"],
        has_manga: false,
        chapters: [],
        relations: [],
      };
      setActiveModalEvent(fallbackEvent);
    }
  };

  const handleModalTrackToggle = async (ev: CalendarEvent) => {
    setTrackingInProgress(true);
    try {
      const showItem = enrichedShows().find(
        (s) =>
          s.calendarEvent?.id === ev.id ||
          s.title.toLowerCase() === ev.title.toLowerCase(),
      );
      if (showItem) {
        await handleRemoveShow(showItem.id);
        setActiveModalEvent(null);
      }
    } finally {
      setTrackingInProgress(false);
    }
  };

  return (
    <div class="page">
      <div class="tracked-header-bar">
        <h2 class="tracked-manager-heading margin-0">Tracked Shows</h2>

        <div class="tracked-controls-group">
          {/* Search bar */}
          <input
            type="text"
            data-testid="tracked-search-input"
            value={filterName()}
            onInput={(e) => setFilterName(e.currentTarget.value)}
            placeholder="Filter by title..."
            class="tracked-filter-input"
          />

          {/* Filter Popover Button */}
          <div class="filter-popover-wrapper">
            <button
              type="button"
              data-testid="filter-popover-btn"
              onClick={() => setShowFilterPopover(!showFilterPopover())}
              class={`btn-filter-toggle ${showFilterPopover() || selectedSources().length > 0 || filterFormat() !== "all" || filterStatus() !== "all" ? "active" : ""}`}
            >
              ⚡ Filter{" "}
              {selectedSources().length > 0 ||
              filterFormat() !== "all" ||
              filterStatus() !== "all"
                ? `(${selectedSources().length + (filterFormat() !== "all" ? 1 : 0) + (filterStatus() !== "all" ? 1 : 0)})`
                : ""}
            </button>

            <Show when={showFilterPopover()}>
              <div class="filter-popover-card" data-testid="filter-popover">
                <div class="popover-section-title">Format / Media</div>
                <div class="popover-radio-group">
                  <label class="popover-radio-label">
                    <input
                      type="radio"
                      name="trackedFormat"
                      checked={filterFormat() === "all"}
                      onChange={() => setFilterFormat("all")}
                    />
                    <span>All Formats</span>
                  </label>
                  <label class="popover-radio-label">
                    <input
                      type="radio"
                      name="trackedFormat"
                      checked={filterFormat() === "anime"}
                      onChange={() => setFilterFormat("anime")}
                    />
                    <span>Anime Only</span>
                  </label>
                  <label class="popover-radio-label">
                    <input
                      type="radio"
                      name="trackedFormat"
                      checked={filterFormat() === "manga"}
                      onChange={() => setFilterFormat("manga")}
                    />
                    <span>Has Manga</span>
                  </label>
                </div>

                <div class="popover-section-title">Status</div>
                <div class="popover-radio-group">
                  <label class="popover-radio-label">
                    <input
                      type="radio"
                      name="trackedStatus"
                      checked={filterStatus() === "all"}
                      onChange={() => setFilterStatus("all")}
                    />
                    <span>All Shows</span>
                  </label>
                  <label class="popover-radio-label">
                    <input
                      type="radio"
                      name="trackedStatus"
                      checked={filterStatus() === "upcoming"}
                      onChange={() => setFilterStatus("upcoming")}
                    />
                    <span>Upcoming Episode</span>
                  </label>
                </div>

                <div class="popover-section-title">Streaming Sources</div>
                <div class="popover-checkbox-grid">
                  <For each={AVAILABLE_SOURCES}>
                    {(src) => (
                      <label class="popover-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedSources().includes(src)}
                          onChange={() => toggleSourceFilter(src)}
                        />
                        <span>{src}</span>
                      </label>
                    )}
                  </For>
                </div>

                <div class="popover-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSources([]);
                      setFilterFormat("all");
                      setFilterStatus("all");
                    }}
                    class="btn-popover-reset"
                  >
                    Reset Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilterPopover(false)}
                    class="btn-popover-apply"
                  >
                    Done
                  </button>
                </div>
              </div>
            </Show>
          </div>

          {/* Add Show Modal Trigger */}
          <button
            type="button"
            data-testid="add-show-modal-btn"
            onClick={() => setShowAddModal(true)}
            class="btn-primary-track"
          >
            + Add Show
          </button>
        </div>
      </div>

      {/* Tracked Shows List View */}
      <div id="tracked-list" class="tracked-list-container">
        {loading() ? (
          <div class="loading-container" data-testid="loading-spinner">
            <div class="spinner" />
            <span>Loading tracked shows...</span>
          </div>
        ) : (
          <div class="tracked-table-wrapper">
            <table class="tracked-table">
              <thead>
                <tr>
                  <th class="col-title">Show Title</th>
                  <th class="col-next">Next Episode</th>
                  <th class="col-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={filteredShows()}
                  fallback={
                    <tr>
                      <td colSpan={3} class="search-results-empty">
                        No tracked shows match your filters. Add one above!
                      </td>
                    </tr>
                  }
                >
                  {(show) => (
                    <tr
                      class="tracked-row tracked-card"
                      data-testid={`tracked-row-${show.id}`}
                    >
                      <td class="col-title">
                        <button
                          type="button"
                          class="show-title-btn"
                          data-testid={`show-title-${show.id}`}
                          onClick={() => handleOpenDetailModal(show)}
                        >
                          {show.calendarEvent?.cover_image && (
                            <img
                              src={show.calendarEvent.cover_image}
                              alt={show.title}
                              class="show-row-thumb"
                            />
                          )}
                          <span class="show-title-text">{show.title}</span>
                        </button>
                      </td>
                      <td class="col-next">
                        <span
                          class={`next-ep-pill ${show.nextEpisodeStr?.includes("No scheduled") ? "none" : "scheduled"}`}
                        >
                          {show.nextEpisodeStr}
                        </span>
                      </td>
                      <td class="col-action">
                        <button
                          type="button"
                          onClick={() => handleRemoveShow(show.id)}
                          class="btn-untrack-red"
                          data-testid={`untrack-btn-${show.id}`}
                        >
                          Untrack
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Show Detail Modal */}
      <ShowDetailModal
        event={activeModalEvent()}
        onClose={() => setActiveModalEvent(null)}
        onTrackToggle={handleModalTrackToggle}
        trackingInProgress={trackingInProgress()}
      />

      {/* Add Show Modal */}
      <Show when={showAddModal()}>
        <div
          class="event-modal-overlay"
          data-testid="add-show-modal"
          onClick={() => setShowAddModal(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowAddModal(false)}
        >
          <div
            class="event-modal-content add-show-modal-content"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div class="event-modal-top">
              <h3 class="event-modal-title">Add Anime to Track List</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                class="btn-modal-close"
              >
                ✕
              </button>
            </div>

            <div class="add-show-modal-grid">
              {/* Form Manual Add */}
              <div>
                <h4 class="section-subheading">Manual Entry</h4>
                <form
                  onSubmit={handleAddShow}
                  class="panel-card tracked-form-col"
                >
                  <div>
                    <label for="track-title" class="form-label">
                      Anime Title
                    </label>
                    <input
                      id="track-title"
                      type="text"
                      value={title()}
                      onInput={(e) => setTitle(e.currentTarget.value)}
                      placeholder="e.g. Solo Leveling"
                      class="form-input"
                      required
                    />
                  </div>
                  <div class="form-row-two-col">
                    <div class="flex-1">
                      <label for="track-subgroup" class="form-label">
                        Subgroup
                      </label>
                      <input
                        id="track-subgroup"
                        type="text"
                        value={subgroup()}
                        onInput={(e) => setSubgroup(e.currentTarget.value)}
                        class="form-input"
                      />
                    </div>
                    <div class="flex-1">
                      <label for="track-res" class="form-label">
                        Resolution
                      </label>
                      <select
                        id="track-res"
                        value={resolution()}
                        onChange={(e) => setResolution(e.currentTarget.value)}
                        class="form-select"
                      >
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="2160p">4K</option>
                      </select>
                    </div>
                  </div>
                  <button
                    id="add-track-button"
                    type="submit"
                    class="btn-primary-track"
                  >
                    Track Show
                  </button>
                </form>
              </div>

              {/* Nyaa Search */}
              <div>
                <h4 class="section-subheading">Search Nyaa Releases</h4>
                <form
                  onSubmit={handleSearch}
                  class="panel-card search-form-row"
                >
                  <input
                    id="search-input"
                    type="text"
                    value={searchQuery()}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                    placeholder="Search anime releases on Nyaa..."
                    class="search-input-flex"
                  />
                  <button
                    id="search-button"
                    type="submit"
                    class="btn-search-submit"
                  >
                    {searching() ? "Searching..." : "Search"}
                  </button>
                </form>

                <div class="panel-card search-results-box">
                  <For
                    each={searchResults()}
                    fallback={
                      <div class="search-results-empty">No search results.</div>
                    }
                  >
                    {(result) => (
                      <div class="search-result-card">
                        <div class="flex-1 min-w-0">
                          <div class="search-result-title" title={result.title}>
                            {result.title}
                          </div>
                          <div class="search-result-meta">
                            Subgroup: {result.subgroup || "None"} | Res:{" "}
                            {result.resolution || "None"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTrackFromSearch(result)}
                          class="btn-use-info"
                        >
                          Use Info
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
/* v8 ignore stop */
/* c8 ignore stop */
