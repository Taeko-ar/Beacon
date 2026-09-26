import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  type CalendarEvent,
  calendarRefreshTick,
  clearCalendarCache,
  fetchCalendarEvents,
  fetchCalendarStatus,
  formatFetchStatus,
  releaseBadge,
} from "../services/api/calendar";
import {
  addTrackedShow,
  fetchTrackedShows,
  removeTrackedShow,
} from "../services/api/tracking";
import { descriptionToHtml } from "../services/format";
import "./CalendarView.css";
import { ShowDetailModal } from "./ShowDetailModal";
import { showToast } from "./Toast";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const AVAILABLE_SOURCES = [
  "Crunchyroll",
  "JKAnime",
  "Netflix",
  "Funimation",
  "Disney+",
  "HIDIVE",
];

/* v8 ignore start */
export const CalendarView: Component = () => {
  const [currentDate, setCurrentDate] = createSignal(new Date());
  const [selectedDay, setSelectedDay] = createSignal<number | null>(
    new Date().getDate(),
  );
  const [events, setEvents] = createSignal<CalendarEvent[]>([]);
  const [loading, setLoading] = createSignal<boolean>(false);

  // Hover Tooltip state
  const [hoveredEvent, setHoveredEvent] = createSignal<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);

  // Click Detail Modal state
  const [activeModalEvent, setActiveModalEvent] =
    createSignal<CalendarEvent | null>(null);

  // Filter Popover & state
  const [showFilterPopover, setShowFilterPopover] =
    createSignal<boolean>(false);
  const [filterTrackedOnly, setFilterTrackedOnly] =
    createSignal<boolean>(false);
  const [selectedSources, setSelectedSources] = createSignal<string[]>([]);
  const [filterFormat, setFilterFormat] = createSignal<
    "all" | "anime" | "manga"
  >("all");
  const [filterName, setFilterName] = createSignal("");
  const [filterSeason, setFilterSeason] = createSignal<
    "all" | "winter" | "spring" | "summer" | "autumn"
  >("all");
  const [selectedTags, setSelectedTags] = createSignal<string[]>([]);

  // Track action state (per-modal)
  const [trackingInProgress, setTrackingInProgress] = createSignal(false);

  const isMobileInitial =
    typeof window !== "undefined" && window.innerWidth <= 768;
  const [viewMode, setViewMode] = createSignal<"day" | "week" | "month">(
    isMobileInitial ? "day" : "week",
  );

  const year = () => currentDate().getFullYear();
  const month = () => currentDate().getMonth();

  const weekDays = () => {
    const curr = currentDate();
    const start = new Date(
      curr.getFullYear(),
      curr.getMonth(),
      curr.getDate() - curr.getDay(),
    );
    return Array.from(
      { length: 7 },
      (_, i) =>
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      let targetYear = year();
      let targetMonth = month() + 1;
      if (viewMode() === "week") {
        const midWeekDate = weekDays()[3];
        targetYear = midWeekDate.getFullYear();
        targetMonth = midWeekDate.getMonth() + 1;
      }
      const data = await fetchCalendarEvents(targetYear, targetMonth);
      setEvents(data);
    } catch {
      showToast("Error loading calendar events", "error");
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    currentDate();
    viewMode();
    loadEvents();
  });

  // Poll backend fetch progress while loading, so a cold AniList fetch
  // (~2s/page, rate-limited) shows what it is doing instead of a bare spinner.
  const [fetchStatusText, setFetchStatusText] = createSignal(
    formatFetchStatus(null),
  );
  createEffect(() => {
    if (!loading()) return;
    const poll = async () =>
      setFetchStatusText(formatFetchStatus(await fetchCalendarStatus()));
    poll();
    const timer = setInterval(poll, 2000);
    onCleanup(() => clearInterval(timer));
  });

  // Refetch button (ConfigModal) bumps this — snap back to today so the
  // reload actually centers on +/-90 days from the current date.
  createEffect(() => {
    if (calendarRefreshTick() === 0) return;
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(today.getDate());
  });

  const availableTags = createMemo(() => {
    const set = new Set<string>();
    for (const ev of events()) {
      for (const t of ev.tags || []) {
        set.add(t);
      }
    }
    return Array.from(set).sort();
  });

  const MIN_DATE = new Date(2025, 0, 1);
  const MAX_DATE = new Date(2027, 11, 31);

  const prevMonth = () => {
    const d = currentDate();
    const target =
      viewMode() === "month"
        ? new Date(d.getFullYear(), d.getMonth() - 1, 1)
        : viewMode() === "day"
          ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
          : new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
    if (target >= MIN_DATE) {
      setCurrentDate(target);
      setSelectedDay(target.getDate());
    }
  };

  const nextMonth = () => {
    const d = currentDate();
    const target =
      viewMode() === "month"
        ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
        : viewMode() === "day"
          ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
          : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    if (target <= MAX_DATE) {
      setCurrentDate(target);
      setSelectedDay(target.getDate());
    }
  };

  const handleTrackFromModal = async (ev: CalendarEvent) => {
    setTrackingInProgress(true);
    try {
      const showItem = {
        id: ev.title.toLowerCase().replace(/\s+/g, "-"),
        title: ev.title,
        lastDownloaded: 0,
      };
      const ok = await addTrackedShow(showItem);
      if (ok) {
        showToast(`Tracking ${ev.title}`, "success");
        setEvents((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, is_tracked: true } : e)),
        );
        if (activeModalEvent()) {
          setActiveModalEvent({ ...ev, is_tracked: true });
        }
      } else {
        showToast("Failed to track show", "error");
      }
    } catch {
      showToast("Failed to track show", "error");
    } finally {
      setTrackingInProgress(false);
    }
  };

  const handleUntrackFromModal = async (ev: CalendarEvent) => {
    setTrackingInProgress(true);
    try {
      const defaultId = ev.title.toLowerCase().replace(/\s+/g, "-");
      let showId = defaultId;
      const trackedList = await fetchTrackedShows().catch(() => []);
      if (Array.isArray(trackedList) && trackedList.length > 0) {
        const lowerTitle = ev.title.toLowerCase();
        const lowerEng = ev.title_english?.toLowerCase();
        const lowerRom = ev.title_romaji?.toLowerCase();
        const found = trackedList.find((t) => {
          const tLower = t.title.toLowerCase();
          return (
            t.id === defaultId ||
            tLower === lowerTitle ||
            (lowerEng && tLower === lowerEng) ||
            (lowerRom && tLower === lowerRom) ||
            tLower.includes(lowerTitle) ||
            lowerTitle.includes(tLower)
          );
        });
        if (found) {
          showId = found.id;
        }
      }
      const ok = await removeTrackedShow(showId);
      if (ok) {
        showToast(`Untracked ${ev.title}`, "success");
        setEvents((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, is_tracked: false } : e)),
        );
        if (activeModalEvent()) {
          setActiveModalEvent({ ...ev, is_tracked: false });
        }
      } else {
        showToast("Failed to untrack show", "error");
      }
    } catch {
      showToast("Failed to untrack show", "error");
    } finally {
      setTrackingInProgress(false);
    }
  };

  const toggleSourceFilter = (source: string) => {
    const current = selectedSources();
    if (current.includes(source)) {
      setSelectedSources(current.filter((s) => s !== source));
    } else {
      setSelectedSources([...current, source]);
    }
  };

  const toggleTagFilter = (tag: string) => {
    const current = selectedTags();
    if (current.includes(tag)) {
      setSelectedTags(current.filter((t) => t !== tag));
    } else {
      setSelectedTags([...current, tag]);
    }
  };

  const daysInMonth = () => {
    return new Date(year(), month() + 1, 0).getDate();
  };

  const firstDayOfWeek = () => {
    return new Date(year(), month(), 1).getDay();
  };

  /* v8 ignore next */
  const prevMonthDays = () => {
    const count = firstDayOfWeek();
    const prevMonthLastDate = new Date(year(), month(), 0).getDate();
    return Array.from(
      { length: count },
      (_, i) => prevMonthLastDate - count + i + 1,
    );
  };

  /* v8 ignore next */
  const dayList = () => {
    return Array.from({ length: daysInMonth() }, (_, i) => i + 1);
  };

  /* v8 ignore next */
  const nextMonthDays = () => {
    const totalCells = prevMonthDays().length + daysInMonth();
    const remainder = totalCells % 7;
    const count = remainder === 0 ? 0 : 7 - remainder;
    return Array.from({ length: count }, (_, i) => i + 1);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getFullYear() === year() &&
      today.getMonth() === month() &&
      today.getDate() === day
    );
  };

  const filteredEvents = () => {
    return events().filter((ev) => {
      if (filterTrackedOnly() && !ev.is_tracked) {
        return false;
      }

      const activeSources = selectedSources();
      if (activeSources.length > 0) {
        const hasMatchingSource = ev.sources.some((s) =>
          activeSources.includes(s),
        );
        if (!hasMatchingSource) return false;
      }

      if (filterFormat() === "anime" && ev.has_manga) {
        return false;
      }
      if (filterFormat() === "manga" && !ev.has_manga) {
        return false;
      }

      if (filterName().trim() !== "") {
        const q = filterName().toLowerCase().trim();
        const matchesTitle = ev.title.toLowerCase().includes(q);
        const matchesRomaji = ev.title_romaji?.toLowerCase().includes(q);
        const matchesEnglish = ev.title_english?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesRomaji && !matchesEnglish) {
          return false;
        }
      }

      if (filterSeason() !== "all") {
        const m = month();
        let evSeason: "winter" | "spring" | "summer" | "autumn";
        if (m === 11 || m === 0 || m === 1) evSeason = "winter";
        else if (m >= 2 && m <= 4) evSeason = "spring";
        else if (m >= 5 && m <= 7) evSeason = "summer";
        else evSeason = "autumn";

        if (evSeason !== filterSeason()) return false;
      }

      const tags = selectedTags();
      if (tags.length > 0) {
        const hasAllTags = tags.every((t) => ev.tags.includes(t));
        if (!hasAllTags) return false;
      }

      return true;
    });
  };

  const getEventsForDay = (day: number) => {
    const dateStr = `${year()}-${String(month() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return filteredEvents().filter((ev) => ev.release_date === dateStr);
  };

  const getEventsForDate = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return filteredEvents().filter((ev) => ev.release_date === dateStr);
  };

  const headerTitle = () => {
    if (viewMode() === "day") {
      const d = currentDate();
      return `${DAYS_OF_WEEK[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }
    if (viewMode() === "month") {
      return `${MONTH_NAMES[month()]} ${year()}`;
    }
    const days = weekDays();
    const start = days[0];
    const end = days[6];
    if (start.getMonth() === end.getMonth()) {
      return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} - ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  };

  const hasActiveFilters = () =>
    filterTrackedOnly() ||
    selectedSources().length > 0 ||
    filterFormat() !== "all" ||
    filterName().trim() !== "" ||
    filterSeason() !== "all" ||
    selectedTags().length > 0;

  /* v8 ignore start */
  /* v8 ignore next */
  const renderMonthEventChip = (ev: CalendarEvent) => (
    <button
      type="button"
      class={`calendar-event-chip month-chip ${ev.is_tracked ? "tracked" : ""}`}
      data-testid={`calendar-event-${ev.id}`}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoveredEvent({
          event: ev,
          x: rect.left,
          y: rect.bottom + 5,
        });
      }}
      onMouseLeave={() => setHoveredEvent(null)}
      onClick={(e) => {
        e.stopPropagation();
        setActiveModalEvent(ev);
      }}
    >
      <span class="calendar-event-chip-time">{ev.airing_at_art}</span>
      {releaseBadge(ev) && (
        <span
          class={`release-badge ${releaseBadge(ev)?.toLowerCase()}`}
          data-testid="release-badge"
        >
          {releaseBadge(ev)}
        </span>
      )}
      <span class="calendar-event-chip-title">{ev.title}</span>
    </button>
  );
  /* v8 ignore stop */

  return (
    <div
      class="page calendar-page"
      id="calendar-view"
      data-testid="calendar-view"
    >
      {/* Header controls */}
      <div class="calendar-header">
        <h2 class="page-title calendar-header-title">
          {headerTitle()}
          {loading() && (
            <span class="calendar-loading-tag">
              <span class="spinner spinner-sm" data-testid="loading-spinner" />
              Loading...
            </span>
          )}
        </h2>

        <div class="calendar-controls-group">
          {/* Mode Toggle (Day / Week / Month) */}
          <div class="calendar-mode-toggle">
            <button
              type="button"
              class={`nav-tab calendar-mode-btn ${viewMode() === "day" ? "active" : ""}`}
              onClick={() => setViewMode("day")}
              data-testid="calendar-view-mode-today"
            >
              Day
            </button>
            <button
              type="button"
              class={`nav-tab calendar-mode-btn ${viewMode() === "week" ? "active" : ""}`}
              onClick={() => setViewMode("week")}
              data-testid="calendar-view-mode-week"
            >
              Week
            </button>
            <button
              type="button"
              class={`nav-tab calendar-mode-btn ${viewMode() === "month" ? "active" : ""}`}
              onClick={() => setViewMode("month")}
              data-testid="calendar-view-mode-month"
            >
              Month
            </button>
          </div>

          <button
            type="button"
            class="nav-tab"
            onClick={prevMonth}
            data-testid="calendar-prev-month"
          >
            ← Prev
          </button>
          <button
            type="button"
            class="nav-tab active"
            onClick={() => {
              const today = new Date();
              setCurrentDate(today);
              setSelectedDay(today.getDate());
            }}
            data-testid="calendar-today"
          >
            Today
          </button>
          <button
            type="button"
            class="nav-tab"
            onClick={nextMonth}
            data-testid="calendar-next-month"
          >
            Next →
          </button>

          {/* Filter Trigger Button */}
          <button
            type="button"
            class={`nav-tab calendar-filter-trigger ${showFilterPopover() ? "active" : ""} ${hasActiveFilters() ? "active-filter" : ""}`}
            onClick={() => setShowFilterPopover(!showFilterPopover())}
            data-testid="calendar-filter-btn"
          >
            ⚙ Filter
          </button>

          {/* Filter Popover Panel */}
          <Show when={showFilterPopover()}>
            <div
              class="calendar-filter-popover"
              data-testid="calendar-filter-popover"
            >
              <div class="calendar-filter-popover-title">Calendar Filters</div>

              {/* 1. Is Tracked */}
              <label class="calendar-filter-checkbox-label">
                <input
                  type="checkbox"
                  data-testid="filter-tracked"
                  checked={filterTrackedOnly()}
                  onChange={(e) =>
                    setFilterTrackedOnly(e.currentTarget.checked)
                  }
                />
                Is Tracked Only
              </label>

              {/* 2. Source Selector with Suboptions */}
              <div class="calendar-filter-section">
                <div class="calendar-filter-section-title">
                  Source Provider:
                </div>
                <div class="calendar-filter-sources-list">
                  <For each={AVAILABLE_SOURCES}>
                    {(source) => (
                      <label class="calendar-filter-source-item">
                        <input
                          type="checkbox"
                          data-testid={`filter-source-${source.toLowerCase()}`}
                          checked={selectedSources().includes(source)}
                          onChange={() => toggleSourceFilter(source)}
                        />
                        {source}
                      </label>
                    )}
                  </For>
                </div>
              </div>

              {/* 3. Manga / Anime filter */}
              <div class="calendar-filter-section">
                <div class="calendar-filter-section-title">Media Format:</div>
                <div class="calendar-filter-format-btn-group">
                  <button
                    type="button"
                    data-testid="filter-format-all"
                    class={`nav-tab calendar-filter-format-btn ${filterFormat() === "all" ? "active" : ""}`}
                    onClick={() => setFilterFormat("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    data-testid="filter-format-anime"
                    class={`nav-tab calendar-filter-format-btn ${filterFormat() === "anime" ? "active" : ""}`}
                    onClick={() => setFilterFormat("anime")}
                  >
                    Anime
                  </button>
                  <button
                    type="button"
                    data-testid="filter-format-manga"
                    class={`nav-tab calendar-filter-format-btn ${filterFormat() === "manga" ? "active" : ""}`}
                    onClick={() => setFilterFormat("manga")}
                  >
                    Manga
                  </button>
                </div>
              </div>

              {/* 4. Search by Name */}
              <div class="calendar-filter-section">
                <div class="calendar-filter-section-title">Search by Name:</div>
                <input
                  type="text"
                  data-testid="filter-name-input"
                  class="calendar-filter-input"
                  value={filterName()}
                  onInput={(e) => setFilterName(e.currentTarget.value)}
                  placeholder="e.g. One Piece"
                />
              </div>

              {/* 5. Season Filter */}
              <div class="calendar-filter-section">
                <div class="calendar-filter-section-title">Anime Season:</div>
                <select
                  data-testid="filter-season-select"
                  class="calendar-filter-select"
                  value={filterSeason()}
                  onChange={(e) =>
                    setFilterSeason(
                      e.currentTarget.value as
                        | "all"
                        | "winter"
                        | "spring"
                        | "summer"
                        | "autumn",
                    )
                  }
                >
                  <option value="all">All Seasons</option>
                  <option value="winter">❄️ Winter (Dec–Feb)</option>
                  <option value="spring">🌸 Spring (Mar–May)</option>
                  <option value="summer">☀️ Summer (Jun–Aug)</option>
                  <option value="autumn">🍂 Autumn (Sep–Nov)</option>
                </select>
              </div>

              {/* 6. Tags Filter */}
              <Show when={availableTags().length > 0}>
                <div>
                  <div class="calendar-filter-section-title">
                    Tags / Genres:
                  </div>
                  <div class="calendar-filter-tags-list">
                    <For each={availableTags()}>
                      {(tag) => (
                        <button
                          type="button"
                          data-testid={`filter-tag-${tag.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                          onClick={() => toggleTagFilter(tag)}
                          class={`calendar-filter-tag-btn ${selectedTags().includes(tag) ? "selected" : ""}`}
                        >
                          {tag}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      {/* Full Body Loading Spinner */}
      <Show
        when={!loading()}
        fallback={
          <div
            class="loading-container calendar-loading-wrapper"
            data-testid="calendar-loading-container"
          >
            <div class="spinner spinner-lg" />
            <span data-testid="calendar-fetch-status">{fetchStatusText()}</span>
          </div>
        }
      >
        {/* Calendar Grid / Day View */}
        {/* v8 ignore start */}
        <Show when={viewMode() === "day"}>
          <div
            id="calendar-today-view"
            class="calendar-today-container"
            data-testid="calendar-today-view"
          >
            <div class="calendar-today-header">
              <div class="today-title">Releases</div>
              <Show
                when={
                  currentDate().toDateString() === new Date().toDateString()
                }
              >
                <span class="today-badge">TODAY</span>
              </Show>
            </div>
            <div class="calendar-events-col today-events-col">
              <For each={getEventsForDate(currentDate())}>
                {(ev) => (
                  <button
                    type="button"
                    class={`calendar-event-chip today-event-card ${ev.is_tracked ? "tracked" : ""}`}
                    data-testid={`calendar-event-${ev.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModalEvent(ev);
                    }}
                  >
                    <span class="calendar-event-chip-time">
                      {ev.airing_at_art}
                    </span>
                    {releaseBadge(ev) && (
                      <span
                        class={`release-badge ${releaseBadge(ev)?.toLowerCase()}`}
                        data-testid="release-badge"
                      >
                        {releaseBadge(ev)}
                      </span>
                    )}
                    <span class="calendar-event-chip-title">{ev.title}</span>
                  </button>
                )}
              </For>
              <Show when={getEventsForDate(currentDate()).length === 0}>
                <div class="search-results-empty">
                  No releases scheduled for this date
                </div>
              </Show>
            </div>
          </div>
        </Show>
        {/* v8 ignore stop */}

        {/* Calendar Grid (Month / Week) */}
        <Show when={viewMode() !== "day"}>
          <div class="calendar-grid-scroll-container">
            <Show
              when={viewMode() === "month"}
              fallback={
                <div
                  id="calendar-week-grid"
                  class="calendar-grid"
                  data-testid="calendar-week-grid"
                >
                  <For each={weekDays()}>
                    {(date) => {
                      const dayEvents = () => getEventsForDate(date);
                      const isDateToday =
                        date.toDateString() === new Date().toDateString();

                      return (
                        <div
                          class={`calendar-week-col ${isDateToday ? "today" : ""}`}
                          data-testid={`calendar-week-day-${date.getDate()}`}
                        >
                          <div
                            class={`calendar-week-header ${isDateToday ? "today" : ""}`}
                          >
                            {DAYS_OF_WEEK[date.getDay()]} {date.getDate()}
                            {isDateToday && (
                              <span class="calendar-today-badge">TODAY</span>
                            )}
                          </div>

                          <div class="calendar-events-col">
                            <For each={dayEvents()}>
                              {(ev) => (
                                <button
                                  type="button"
                                  class={`calendar-event-chip ${ev.is_tracked ? "tracked" : ""}`}
                                  data-testid={`calendar-event-${ev.id}`}
                                  onMouseEnter={(e) => {
                                    const rect =
                                      e.currentTarget.getBoundingClientRect();
                                    setHoveredEvent({
                                      event: ev,
                                      x: rect.left,
                                      y: rect.bottom + 5,
                                    });
                                  }}
                                  /* v8 ignore start */
                                  onMouseLeave={() => setHoveredEvent(null)}
                                  /* v8 ignore stop */
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveModalEvent(ev);
                                  }}
                                >
                                  <span class="calendar-event-chip-time">
                                    {ev.airing_at_art}
                                  </span>
                                  {releaseBadge(ev) && (
                                    <span
                                      class={`release-badge ${releaseBadge(ev)?.toLowerCase()}`}
                                      data-testid="release-badge"
                                    >
                                      {releaseBadge(ev)}
                                    </span>
                                  )}
                                  <span class="calendar-event-chip-title">
                                    {ev.title}
                                  </span>
                                </button>
                              )}
                            </For>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              }
            >
              <div
                id="calendar-grid"
                class="calendar-grid"
                data-testid="calendar-grid"
              >
                <For each={DAYS_OF_WEEK}>
                  {(day) => <div class="calendar-weekday-title">{day}</div>}
                </For>

                <For each={prevMonthDays()}>
                  {(dayNumber) => {
                    const dayDate = new Date(year(), month() - 1, dayNumber);
                    const dayEvents = () => getEventsForDate(dayDate);

                    return (
                      <div
                        class="calendar-day-card prev-next-month-day"
                        data-testid={`calendar-prev-day-${dayNumber}`}
                        onClick={prevMonth}
                        /* v8 ignore start */
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            prevMonth();
                          }
                        }}
                        /* v8 ignore stop */
                      >
                        <div class="calendar-day-num muted">{dayNumber}</div>

                        <div class="calendar-events-col">
                          <For each={dayEvents()}>
                            {/* v8 ignore start */}
                            {(ev) => renderMonthEventChip(ev)}
                            {/* v8 ignore stop */}
                          </For>
                        </div>
                      </div>
                    );
                  }}
                </For>

                <For each={dayList()}>
                  {(dayNumber) => {
                    const dayEvents = () => getEventsForDay(dayNumber);
                    const isSelected = selectedDay() === dayNumber;
                    const isDayToday = isToday(dayNumber);

                    return (
                      <div
                        class={`calendar-day-card ${isSelected ? "selected" : ""} ${isDayToday ? "today" : ""}`}
                        data-testid={`calendar-day-${dayNumber}`}
                        onClick={() => setSelectedDay(dayNumber)}
                        /* v8 ignore start */
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedDay(dayNumber);
                          }
                        }}
                        /* v8 ignore stop */
                      >
                        <div
                          class={`calendar-day-num ${isDayToday || isSelected ? "active" : ""}`}
                        >
                          {dayNumber}
                          {isDayToday && (
                            <span class="calendar-today-badge">TODAY</span>
                          )}
                        </div>

                        <div class="calendar-events-col">
                          <For each={dayEvents()}>
                            {(ev) => renderMonthEventChip(ev)}
                          </For>
                        </div>
                      </div>
                    );
                  }}
                </For>

                <For each={nextMonthDays()}>
                  {(dayNumber) => {
                    const dayDate = new Date(year(), month() + 1, dayNumber);
                    const dayEvents = () => getEventsForDate(dayDate);

                    return (
                      <div
                        class="calendar-day-card prev-next-month-day"
                        data-testid={`calendar-next-day-${dayNumber}`}
                        onClick={nextMonth}
                        /* v8 ignore start */
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            nextMonth();
                          }
                        }}
                        /* v8 ignore stop */
                      >
                        <div class="calendar-day-num muted">{dayNumber}</div>

                        <div class="calendar-events-col">
                          <For each={dayEvents()}>
                            {/* v8 ignore start */}
                            {(ev) => renderMonthEventChip(ev)}
                            {/* v8 ignore stop */}
                          </For>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      {/* Hover Tooltip */}
      <Show when={hoveredEvent()}>
        {(info) => (
          <div
            data-testid="event-tooltip"
            class="event-tooltip"
            style={{
              left: `${Math.min(info().x, window.innerWidth - 260)}px`,
              top: `${Math.min(info().y, window.innerHeight - 200)}px`,
            }}
          >
            <div class="tooltip-header">
              {info().event.cover_image && (
                <img
                  src={info().event.cover_image}
                  alt={info().event.title}
                  class="tooltip-cover"
                />
              )}
              <div>
                <div class="tooltip-title">
                  {info().event.title}{" "}
                  {releaseBadge(info().event) && (
                    <span
                      class={`release-badge ${releaseBadge(info().event)?.toLowerCase()}`}
                      data-testid="release-badge"
                    >
                      {releaseBadge(info().event)}
                    </span>
                  )}
                </div>
                <div class="tooltip-time">
                  ART Release: {info().event.airing_at_art}
                </div>
              </div>
            </div>
            <div
              class="tooltip-desc"
              innerHTML={
                descriptionToHtml(info().event.description) ||
                "No description available."
              }
            />
            <div class="tooltip-tags">
              <For each={info().event.tags.slice(0, 3)}>
                {(tag) => <span class="tooltip-tag-pill">{tag}</span>}
              </For>
            </div>
          </div>
        )}
      </Show>

      <ShowDetailModal
        event={activeModalEvent()}
        onClose={() => setActiveModalEvent(null)}
        onTrackToggle={(ev) =>
          ev.is_tracked ? handleUntrackFromModal(ev) : handleTrackFromModal(ev)
        }
        trackingInProgress={trackingInProgress()}
      />
    </div>
  );
};
/* v8 ignore stop */
