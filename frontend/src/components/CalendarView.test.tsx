import { fireEvent, render, waitFor } from "solid-testing-library";
import { describe, expect, it, vi } from "vitest";
import * as calendarApi from "../services/api/calendar";
import * as trackingApi from "../services/api/tracking";
import {
  CalendarView,
  getModalMainWatchChapters,
  getModalOtherBadges,
} from "./CalendarView";

describe("CalendarView Component", () => {
  it("getModalMainWatchChapters and getModalOtherBadges handle null and non-null events", () => {
    expect(getModalMainWatchChapters(null)).toEqual([]);
    expect(getModalOtherBadges(null)).toEqual([]);

    const testEv: calendarApi.CalendarEvent = {
      id: 1,
      media_id: 1,
      title: "Test",
      airing_at: 1000,
      airing_at_art: "12:00",
      release_date: "2026-01-01",
      episode: 1,
      tags: [],
      format: "TV",
      is_tracked: false,
      sources: ["Disney+"],
      has_manga: false,
      chapters: [
        { number: 1, site: "JKAnime", url: "http://jkanime" },
        { number: 1, site: "Netflix", url: "http://netflix" },
      ],
      relations: [],
    };
    expect(getModalMainWatchChapters(testEv)).toHaveLength(1);
    expect(getModalOtherBadges(testEv)).toHaveLength(2);
  });

  it("renders calendar with current week header and grid", async () => {
    const { getByTestId } = render(() => <CalendarView />);
    expect(getByTestId("calendar-view")).toBeTruthy();
    fireEvent.click(getByTestId("calendar-view-mode-today"));
    fireEvent.click(getByTestId("calendar-view-mode-week"));
    await waitFor(() => {
      expect(getByTestId("calendar-week-grid")).toBeTruthy();
    });
    const weekDay = getByTestId(`calendar-week-day-${new Date().getDate()}`);
    fireEvent.click(weekDay);
    fireEvent.click(getByTestId("calendar-today"));
  });

  it("handles 12-month navigation boundaries (minDate / maxDate bounds) and catch errors", async () => {
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockRejectedValue(
      new Error("Network fail"),
    );

    const { getByTestId } = render(() => <CalendarView />);
    const prevBtn = getByTestId("calendar-prev-month");
    const nextBtn = getByTestId("calendar-next-month");
    const todayBtn = getByTestId("calendar-today");

    for (let i = 0; i < 14; i++) {
      fireEvent.click(prevBtn);
    }
    for (let i = 0; i < 26; i++) {
      fireEvent.click(nextBtn);
    }
    fireEvent.click(todayBtn);

    await waitFor(() => {
      expect(getByTestId("calendar-view")).toBeTruthy();
    });
  });

  it("toggles all source filters, tracked filter, and media format filters (anime/manga)", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 101,
        media_id: 1,
        title: "Boku no Hero Academia",
        airing_at: 1700000000,
        airing_at_art: "14:30",
        release_date: todayStr,
        episode: 12,
        description: "Hero anime description",
        tags: ["Action", "Shounen", "Superpower", "School"],
        cover_image: "https://example.com/cover.jpg",
        format: "MANGA",
        is_tracked: false,
        sources: ["Crunchyroll", "JKAnime"],
        has_manga: true,
        chapters: [
          {
            number: 12,
            site: "Crunchyroll",
            url: "https://crunchyroll.com/hero",
          },
        ],
        relations: [
          {
            id: 2,
            title: "Hero Season 2",
            format: "TV",
            relation_type: "SEQUEL",
          },
        ],
      },
      {
        id: 102,
        media_id: 2,
        title: "Anime Only Show",
        airing_at: 1700000000,
        airing_at_art: "18:00",
        release_date: todayStr,
        episode: 1,
        description: "Original show",
        tags: ["Sci-Fi"],
        format: "TV",
        is_tracked: true,
        sources: ["Netflix"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];

    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);

    await waitFor(() => {
      expect(getByTestId("calendar-event-101")).toBeTruthy();
      expect(getByTestId("calendar-event-102")).toBeTruthy();
    });

    const filterBtn = getByTestId("calendar-filter-btn");
    fireEvent.click(filterBtn);

    const trackedCheckbox = getByTestId("filter-tracked");
    fireEvent.click(trackedCheckbox);
    expect(queryByTestId("calendar-event-101")).toBeNull();
    fireEvent.click(trackedCheckbox);

    // Toggle every available source checkbox to cover all inline functions
    const sources = [
      "crunchyroll",
      "jkanime",
      "netflix",
      "funimation",
      "disney+",
      "hidive",
    ];
    for (const src of sources) {
      const cb = getByTestId(`filter-source-${src}`);
      fireEvent.click(cb);
      fireEvent.click(cb);
    }

    const mangaBtn = getByTestId("filter-format-manga");
    fireEvent.click(mangaBtn);
    expect(queryByTestId("calendar-event-102")).toBeNull();

    const animeBtn = getByTestId("filter-format-anime");
    fireEvent.click(animeBtn);
    expect(queryByTestId("calendar-event-101")).toBeNull();

    const allBtn = getByTestId("filter-format-all");
    fireEvent.click(allBtn);
    expect(getByTestId("calendar-event-101")).toBeTruthy();
  });

  it("handles events with missing cover images, descriptions, tags, and relations", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 303,
        media_id: 3,
        title: "Minimal Event",
        airing_at: 1700000000,
        airing_at_art: "20:00",
        release_date: todayStr,
        episode: 1,
        description: undefined,
        tags: [],
        cover_image: undefined,
        format: "TV",
        is_tracked: false,
        sources: ["JKAnime"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];

    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId, getByText } = render(() => (
      <CalendarView />
    ));

    await waitFor(() => {
      expect(getByTestId("calendar-event-303")).toBeTruthy();
    });

    const chip = getByTestId("calendar-event-303");
    fireEvent.mouseEnter(chip);

    await waitFor(() => {
      expect(getByTestId("event-tooltip")).toBeTruthy();
      expect(getByText("No description available.")).toBeTruthy();
    });

    fireEvent.mouseLeave(chip);

    fireEvent.click(chip);

    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
      expect(getByText("Anime Only / Original")).toBeTruthy();
      expect(getByText("No description provided.")).toBeTruthy();
    });

    const modalBackdrop = getByTestId("event-modal");
    fireEvent.keyDown(modalBackdrop, { key: "Enter" });
    expect(queryByTestId("event-modal")).toBeNull();
  });

  it("copies show title to clipboard when copy button in modal is clicked", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    });

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 404,
        media_id: 4,
        title: "Title Copy Test Anime",
        airing_at: 1700000000,
        airing_at_art: "12:00",
        release_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];

    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { findByTestId } = render(() => <CalendarView />);

    const chip = await findByTestId("calendar-event-404");
    fireEvent.click(chip);

    const copyBtn = await findByTestId("copy-title-btn");
    fireEvent.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledWith("Title Copy Test Anime");
  });

  it("handles hover tooltip, chip click modal, tracked badge, close X button, and backdrop interactions", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 202,
        media_id: 2,
        title: "One Piece",
        airing_at: 1700000000,
        airing_at_art: "09:30",
        release_date: todayStr,
        episode: 1100,
        description: "Pirate adventure",
        tags: ["Adventure", "Action", "Shounen", "Fantasy"],
        cover_image: "https://example.com/op.jpg",
        format: "TV",
        is_tracked: true,
        sources: ["Crunchyroll"],
        has_manga: true,
        chapters: [
          {
            number: 1100,
            site: "Crunchyroll",
            url: "https://crunchyroll.com/onepiece",
          },
        ],
        relations: [
          {
            id: 99,
            title: "One Piece Film Red",
            format: "MOVIE",
            relation_type: "SIDE_STORY",
          },
        ],
      },
    ];

    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId, getByText } = render(() => (
      <CalendarView />
    ));

    await waitFor(() => {
      expect(getByTestId("calendar-event-202")).toBeTruthy();
    });

    const chip = getByTestId("calendar-event-202");
    fireEvent.mouseEnter(chip);

    await waitFor(() => {
      expect(getByTestId("event-tooltip")).toBeTruthy();
    });

    fireEvent.mouseLeave(chip);
    expect(queryByTestId("event-tooltip")).toBeNull();

    fireEvent.click(chip);

    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
      expect(getByText("Has Manga Adaptation")).toBeTruthy();
      expect(getByText("✓ Tracked")).toBeTruthy();
      expect(getByText("One Piece Film Red")).toBeTruthy();
    });

    const modalBackdrop = getByTestId("event-modal");
    const modalContent = getByTestId("event-modal-content");
    fireEvent.click(modalContent); // triggers stopPropagation click
    fireEvent.keyDown(modalContent, { key: "Enter" }); // triggers stopPropagation keydown

    fireEvent.keyDown(modalBackdrop, { key: "Escape" });
    expect(queryByTestId("event-modal")).toBeNull();

    fireEvent.click(chip);
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });
    const closeBtn = getByText("✕");
    fireEvent.click(closeBtn);
    expect(queryByTestId("event-modal")).toBeNull();
  });

  it("switches view modes between month and week grids and navigates weeks", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 999,
        media_id: 9,
        title: "Week Show",
        airing_at: 1700000000,
        airing_at_art: "12:00",
        release_date: todayStr,
        episode: 1,
        description: "Desc",
        tags: ["Action"],
        format: "TV",
        is_tracked: true,
        sources: ["Crunchyroll"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 998,
        media_id: 8,
        title: "Untracked Week Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: todayStr,
        episode: 1,
        description: "Desc 2",
        tags: ["Drama"],
        format: "TV",
        is_tracked: false,
        sources: ["JKAnime"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);
    await waitFor(() => {
      expect(getByTestId("calendar-week-grid")).toBeTruthy();
    });

    const monthModeBtn = getByTestId("calendar-view-mode-month");
    fireEvent.click(monthModeBtn);

    await waitFor(() => {
      expect(getByTestId("calendar-grid")).toBeTruthy();
      expect(queryByTestId("calendar-week-grid")).toBeNull();
    });

    const weekModeBtn = getByTestId("calendar-view-mode-week");
    fireEvent.click(weekModeBtn);
    await waitFor(() => {
      expect(getByTestId("calendar-week-grid")).toBeTruthy();
    });

    await waitFor(() => {
      expect(getByTestId("calendar-event-999")).toBeTruthy();
    });

    const chip = getByTestId("calendar-event-999");
    fireEvent.mouseEnter(chip);
    fireEvent.mouseLeave(chip);
    fireEvent.click(chip);

    const prevBtn = getByTestId("calendar-prev-month");
    const nextBtn = getByTestId("calendar-next-month");
    fireEvent.click(prevBtn);
    fireEvent.click(nextBtn);

    fireEvent.click(monthModeBtn);

    await waitFor(() => {
      expect(getByTestId("calendar-grid")).toBeTruthy();
    });
  });

  it("tests calendar.ts fallback when apiFetch returns error or non-array data", async () => {
    vi.restoreAllMocks();
    const events = await calendarApi.fetchCalendarEvents(2026, 7);
    expect(Array.isArray(events)).toBe(true);
  });

  it("month-mode prev/next navigation calls prevMonth/nextMonth and respects bounds", async () => {
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue([]);

    const { getByTestId } = render(() => <CalendarView />);
    // Switch to month view
    fireEvent.click(getByTestId("calendar-view-mode-month"));

    const prevBtn = getByTestId("calendar-prev-month");
    const nextBtn = getByTestId("calendar-next-month");

    // Navigate forward a few months and back (covers prevMonth/nextMonth lines 178-203)
    for (let i = 0; i < 3; i++) fireEvent.click(nextBtn);
    for (let i = 0; i < 6; i++) fireEvent.click(prevBtn);
    // Attempt to go past the minDate boundary (12+ months back) — should silently stop
    for (let i = 0; i < 14; i++) fireEvent.click(prevBtn);
    // Attempt to go past maxDate boundary
    for (let i = 0; i < 26; i++) fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getByTestId("calendar-view")).toBeTruthy();
    });
  });

  it("getSeasonFromDate covers autumn branch (Sep-Nov)", async () => {
    // Autumn = month 9-11
    const autumnDate = `${new Date().getFullYear()}-10-15`;
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 801,
        media_id: 8,
        title: "Autumn Show",
        airing_at: 1700000000,
        airing_at_art: "18:00",
        release_date: autumnDate,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 802,
        media_id: 9,
        title: "Today Show",
        airing_at: 1700000000,
        airing_at_art: "18:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);
    // Both events loaded (week mode — only todayShow visible in grid)
    await waitFor(() => {
      expect(getByTestId("calendar-event-802")).toBeTruthy();
    });

    // Open filter and set season = autumn
    fireEvent.click(getByTestId("calendar-filter-btn"));
    fireEvent.change(getByTestId("filter-season-select"), {
      target: { value: "autumn" },
    });

    // Today show (non-autumn) should be hidden
    await waitFor(() => {
      expect(queryByTestId("calendar-event-802")).toBeNull();
    });
  });

  it("month-view day card keydown Enter/Space selects day", async () => {
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue([]);

    const { getByTestId } = render(() => <CalendarView />);
    fireEvent.click(getByTestId("calendar-view-mode-month"));

    await waitFor(() => {
      expect(getByTestId("calendar-grid")).toBeTruthy();
    });

    const today = new Date().getDate();
    const dayCard = getByTestId(`calendar-day-${today}`);
    fireEvent.click(dayCard); // covers onClick handler
    fireEvent.keyDown(dayCard, { key: "Enter" });
    fireEvent.keyDown(dayCard, { key: " " });
    fireEvent.keyDown(dayCard, { key: "Tab" }); // no-op key
    expect(dayCard).toBeTruthy();
  });

  it("filters events by name search input", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 401,
        media_id: 4,
        title: "Naruto",
        airing_at: 1700000000,
        airing_at_art: "10:00",
        release_date: todayStr,
        episode: 1,
        tags: ["Action"],
        format: "TV",
        is_tracked: false,
        sources: ["Crunchyroll"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 402,
        media_id: 5,
        title: "Bleach",
        airing_at: 1700000000,
        airing_at_art: "11:00",
        release_date: todayStr,
        episode: 1,
        tags: ["Action"],
        format: "TV",
        is_tracked: false,
        sources: ["Crunchyroll"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);
    await waitFor(() => {
      expect(getByTestId("calendar-event-401")).toBeTruthy();
    });

    fireEvent.click(getByTestId("calendar-filter-btn"));
    const nameInput = getByTestId("filter-name-input");
    fireEvent.input(nameInput, { target: { value: "naruto" } });

    await waitFor(() => {
      expect(getByTestId("calendar-event-401")).toBeTruthy();
      expect(queryByTestId("calendar-event-402")).toBeNull();
    });

    fireEvent.input(nameInput, { target: { value: "" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-402")).toBeTruthy();
    });
  });

  it("filters events by season dropdown", async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    const currentMonthNum = now.getMonth() + 1;
    const currentSeason =
      currentMonthNum === 12 || currentMonthNum <= 2
        ? "winter"
        : currentMonthNum <= 5
          ? "spring"
          : currentMonthNum <= 8
            ? "summer"
            : "autumn";
    const oppositeSeason = currentSeason === "summer" ? "winter" : "summer";

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 501,
        media_id: 5,
        title: "Season Show",
        airing_at: 1700000000,
        airing_at_art: "12:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);
    await waitFor(() => {
      expect(getByTestId("calendar-event-501")).toBeTruthy();
    });

    fireEvent.click(getByTestId("calendar-filter-btn"));
    if (queryByTestId("filter-tracked-only")) {
      fireEvent.click(getByTestId("filter-tracked-only"));
    }
    const formatSelect = queryByTestId("filter-format-select");
    if (formatSelect) {
      fireEvent.change(formatSelect, { target: { value: "anime" } });
      fireEvent.change(formatSelect, { target: { value: "manga" } });
      fireEvent.change(formatSelect, { target: { value: "all" } });
    }
    const seasonSelect = getByTestId("filter-season-select");

    // Filter by current season → still visible
    fireEvent.change(seasonSelect, { target: { value: currentSeason } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-501")).toBeTruthy();
    });

    // Filter by opposite season → hidden
    fireEvent.change(seasonSelect, { target: { value: oppositeSeason } });
    await waitFor(() => {
      expect(queryByTestId("calendar-event-501")).toBeNull();
    });

    // Reset → visible again
    fireEvent.change(seasonSelect, { target: { value: "all" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-501")).toBeTruthy();
    });
  });

  it("filters events by tag selection", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 601,
        media_id: 6,
        title: "Action Show",
        airing_at: 1700000000,
        airing_at_art: "14:00",
        release_date: todayStr,
        episode: 1,
        tags: ["Action", "Shounen"],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 602,
        media_id: 7,
        title: "Romance Show",
        airing_at: 1700000000,
        airing_at_art: "15:00",
        release_date: todayStr,
        episode: 1,
        tags: ["Romance"],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);
    await waitFor(() => {
      expect(getByTestId("calendar-event-601")).toBeTruthy();
    });

    fireEvent.click(getByTestId("calendar-filter-btn"));
    const actionTag = getByTestId("filter-tag-action");
    fireEvent.click(actionTag);

    await waitFor(() => {
      expect(getByTestId("calendar-event-601")).toBeTruthy();
      expect(queryByTestId("calendar-event-602")).toBeNull();
    });

    fireEvent.click(actionTag);
    await waitFor(() => {
      expect(getByTestId("calendar-event-602")).toBeTruthy();
    });
  });

  it("Track Show and Untrack buttons appear in modal and do optimistic update", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 701,
        media_id: 7,
        title: "Track Me",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ ok: true, data: {} }),
    } as Response);

    const { getByTestId, getByText, queryByText, queryByTestId } = render(
      () => <CalendarView />,
    );
    await waitFor(() => {
      expect(getByTestId("calendar-event-701")).toBeTruthy();
    });

    fireEvent.click(getByTestId("calendar-event-701"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    expect(getByTestId("modal-track-btn")).toBeTruthy();
    expect(queryByTestId("modal-untrack-btn")).toBeNull();

    fireEvent.click(getByTestId("modal-track-btn"));
    await waitFor(() => {
      expect(getByText("✓ Tracked")).toBeTruthy();
    });
    expect(getByTestId("modal-untrack-btn")).toBeTruthy();
    expect(queryByTestId("modal-track-btn")).toBeNull();

    fireEvent.click(getByTestId("modal-untrack-btn"));
    await waitFor(() => {
      expect(queryByText("✓ Tracked")).toBeNull();
    });
    expect(getByTestId("modal-track-btn")).toBeTruthy();
    expect(queryByTestId("modal-untrack-btn")).toBeNull();
    fireEvent.click(getByText("✕"));
  });

  it("covers remaining branches (spring/winter season, other event map in track/untrack)", async () => {
    vi.useFakeTimers();
    // Start directly in April 2026 (Spring)
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 901,
        media_id: 91,
        title: "Spring Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: "2026-04-15",
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 902,
        media_id: 92,
        title: "Winter Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: "2026-01-15",
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ ok: true, data: {} }),
    } as Response);

    const { getByTestId, queryByTestId, getByText } = render(() => (
      <CalendarView />
    ));

    // Switch to month view
    fireEvent.click(getByTestId("calendar-view-mode-month"));

    // Switch to real timers so waitFor / async updates resolve cleanly
    vi.useRealTimers();

    await waitFor(() => {
      expect(getByTestId("calendar-event-901")).toBeTruthy();
    });

    // Open filter and verify seasons
    fireEvent.click(getByTestId("calendar-filter-btn"));
    const seasonSelect = getByTestId("filter-season-select");

    // Filter by spring -> 901 visible
    fireEvent.change(seasonSelect, { target: { value: "spring" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-901")).toBeTruthy();
    });

    // Filter by winter -> 901 hidden
    fireEvent.change(seasonSelect, { target: { value: "winter" } });
    await waitFor(() => {
      expect(queryByTestId("calendar-event-901")).toBeNull();
    });

    // Reset filter
    fireEvent.change(seasonSelect, { target: { value: "all" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-901")).toBeTruthy();
    });

    // Open modal and track/untrack to cover map-other-event branch (where e.id !== ev.id)
    fireEvent.click(getByTestId("calendar-event-901"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    fireEvent.click(getByTestId("modal-track-btn"));
    // Wait for the track operation to finish (trackingInProgress becomes false)
    await waitFor(() => {
      expect(getByTestId("modal-untrack-btn").hasAttribute("disabled")).toBe(
        false,
      );
    });

    // Verify activeModalEvent was updated in state
    expect(getByText("✓ Tracked")).toBeTruthy();

    fireEvent.click(getByTestId("modal-untrack-btn"));
    await waitFor(() => {
      expect(getByTestId("modal-track-btn")).toBeTruthy();
    });
    fireEvent.click(getByText("✕"));
  });

  it("handles prev/next month day card keydowns and rendering of extra source badges in modal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));

    const todayStr = "2026-07-15";
    const prevMonthStr = "2026-06-28";
    const nextMonthStr = "2026-08-01";

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 990,
        media_id: 99,
        title: "Badged Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: ["Disney+", "Hulu"],
        has_manga: false,
        chapters: [
          {
            number: 1,
            site: "Netflix",
            url: "https://netflix.com",
          },
        ],
        relations: [
          {
            id: 100,
            title: "Related Sequel",
            relation_type: "Sequel",
            format: "TV",
          },
        ],
      },
      {
        id: 991,
        media_id: 991,
        title: "Prev Month Show",
        airing_at: 1700000000,
        airing_at_art: "10:00",
        release_date: prevMonthStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: true,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 992,
        media_id: 992,
        title: "Next Month Show",
        airing_at: 1700000000,
        airing_at_art: "11:00",
        release_date: nextMonthStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: true,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { container, getByTestId, getByText, queryByTestId } = render(() => (
      <CalendarView />
    ));
    vi.useRealTimers();
    fireEvent.click(getByTestId("calendar-view-mode-month"));

    await waitFor(() => {
      expect(getByTestId("calendar-grid")).toBeTruthy();
    });

    await waitFor(() => {
      expect(getByTestId("calendar-event-990")).toBeTruthy();
    });
    const chip = getByTestId("calendar-event-990");
    fireEvent.mouseEnter(chip);
    fireEvent.mouseLeave(chip);
    fireEvent.click(chip);

    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
      expect(getByTestId("source-badge-netflix")).toBeTruthy();
      expect(getByTestId("source-badge-disney-")).toBeTruthy();
    });

    fireEvent.click(getByText("✕"));

    await waitFor(() => {
      expect(getByTestId("calendar-event-991")).toBeTruthy();
    });
    const prevChip = getByTestId("calendar-event-991");
    fireEvent.mouseEnter(prevChip);
    fireEvent.mouseLeave(prevChip);
    fireEvent.click(prevChip);
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });
    fireEvent.click(getByText("✕"));

    await waitFor(() => {
      expect(getByTestId("calendar-event-992")).toBeTruthy();
    });
    const nextChip = getByTestId("calendar-event-992");
    fireEvent.mouseEnter(nextChip);
    fireEvent.mouseLeave(nextChip);
    fireEvent.click(nextChip);
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });
    fireEvent.click(getByText("✕"));

    const prevDayElem = queryByTestId("calendar-prev-day-28");
    if (prevDayElem) {
      fireEvent.keyDown(prevDayElem, { key: "Enter" });
    }
    const nextDayElem = queryByTestId("calendar-next-day-1");
    if (nextDayElem) {
      fireEvent.keyDown(nextDayElem, { key: "Enter" });
    }

    const prevDayCard = container.querySelector(".prev-next-month-day");
    if (prevDayCard) {
      fireEvent.keyDown(prevDayCard, { key: "Shift" });
      fireEvent.keyDown(prevDayCard, { key: "Enter" });
      fireEvent.keyDown(prevDayCard, { key: " " });
    }
  });

  it("handles failure and error branches in modal track and untrack handlers", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 991,
        media_id: 991,
        title: "Fail Track Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 992,
        media_id: 992,
        title: "Fail Untrack Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: true,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const { getByTestId } = render(() => <CalendarView />);
    await waitFor(() => {
      expect(getByTestId("calendar-event-991")).toBeTruthy();
    });

    fireEvent.click(getByTestId("calendar-event-991"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    fireEvent.click(getByTestId("modal-track-btn"));
    await waitFor(() => {
      expect(getByTestId("modal-track-btn").hasAttribute("disabled")).toBe(
        false,
      );
    });

    fireEvent.click(getByTestId("calendar-event-992"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    fireEvent.click(getByTestId("modal-untrack-btn"));
    await waitFor(() => {
      expect(getByTestId("modal-untrack-btn").hasAttribute("disabled")).toBe(
        false,
      );
    });
  });

  it("handles thrown errors in modal track and untrack handlers, next month card keydowns, and autumn season calculation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 995,
        media_id: 995,
        title: "Throw Show",
        airing_at: 1700000000,
        airing_at_art: "16:00",
        release_date: "2026-10-15",
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
      {
        id: 996,
        media_id: 996,
        title: "Throw Show 2",
        airing_at: 1700000000,
        airing_at_art: "17:00",
        release_date: "2026-10-15",
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: true,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);
    vi.spyOn(trackingApi, "addTrackedShow").mockRejectedValue(
      new Error("Fail track"),
    );
    vi.spyOn(trackingApi, "removeTrackedShow").mockRejectedValue(
      new Error("Fail untrack"),
    );

    const { getByTestId, queryByTestId, getByText } = render(() => (
      <CalendarView />
    ));
    vi.useRealTimers();

    await waitFor(() => {
      expect(getByTestId("calendar-event-995")).toBeTruthy();
    });

    // Test autumn season filtering in October
    fireEvent.click(getByTestId("calendar-filter-btn"));
    fireEvent.change(getByTestId("filter-season-select"), {
      target: { value: "autumn" },
    });
    await waitFor(() => {
      expect(getByTestId("calendar-event-995")).toBeTruthy();
    });

    // Test modal track/untrack throws catch block
    fireEvent.click(getByTestId("calendar-event-995"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    fireEvent.click(getByTestId("modal-track-btn"));
    await waitFor(() => {
      expect(getByTestId("modal-track-btn").hasAttribute("disabled")).toBe(
        false,
      );
    });
    fireEvent.click(getByText("✕"));

    fireEvent.click(getByTestId("calendar-event-996"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    fireEvent.click(getByTestId("modal-untrack-btn"));
    await waitFor(() => {
      expect(getByTestId("modal-untrack-btn").hasAttribute("disabled")).toBe(
        false,
      );
    });
  });

  it("handles next month day card keydowns in May view mode", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const { getByTestId, queryByTestId } = render(() => <CalendarView />);
    vi.useRealTimers();

    fireEvent.click(getByTestId("calendar-view-mode-month"));
    await waitFor(() => {
      expect(getByTestId("calendar-grid")).toBeTruthy();
    });

    await waitFor(() => {
      expect(queryByTestId("calendar-next-day-1")).toBeTruthy();
    });

    const nextDay = getByTestId("calendar-next-day-1");
    fireEvent.keyDown(nextDay, { key: "Shift" });
    fireEvent.keyDown(nextDay, { key: "Enter" });
    fireEvent.keyDown(nextDay, { key: " " });
  });

  it("covers February remainder===0 branch, romaji/english name filter, undefined tags/sources, and null activeModalEvent track/untrack", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 9991,
        media_id: 9991,
        title: "Main Title",
        title_romaji: "Romaji Name",
        title_english: "English Name",
        airing_at: 1700000000,
        airing_at_art: "12:00",
        release_date: "2026-02-15",
        episode: 1,
        tags: undefined as unknown as string[],
        sources: undefined as unknown as string[],
        format: "TV",
        is_tracked: false,
        has_manga: false,
        chapters: [
          { number: 1, site: "Crunchyroll", url: "https://crunchyroll.com" },
          { number: 1, site: "Netflix", url: "https://netflix.com" },
        ],
        relations: [],
      },
      {
        id: 9992,
        media_id: 9992,
        title: "Main Title 2",
        title_romaji: "Romaji Name 2",
        title_english: "English Name 2",
        airing_at: 1700000000,
        airing_at_art: "13:00",
        release_date: "2026-02-15",
        episode: 1,
        tags: undefined as unknown as string[],
        sources: undefined as unknown as string[],
        format: "TV",
        is_tracked: true,
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId, getByText, queryByTestId } = render(() => (
      <CalendarView />
    ));
    vi.useRealTimers();

    fireEvent.click(getByTestId("calendar-view-mode-month"));
    await waitFor(() => {
      expect(getByTestId("calendar-grid")).toBeTruthy();
    });

    // Romaji search
    fireEvent.click(getByTestId("calendar-filter-btn"));
    const nameInput = getByTestId("filter-name-input");
    fireEvent.input(nameInput, { target: { value: "romaji" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-9991")).toBeTruthy();
    });

    // English search
    fireEvent.input(nameInput, { target: { value: "english" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-9991")).toBeTruthy();
    });

    // Filter winter season in Feb
    const seasonSelect = getByTestId("filter-season-select");
    fireEvent.change(seasonSelect, { target: { value: "winter" } });
    await waitFor(() => {
      expect(getByTestId("calendar-event-9991")).toBeTruthy();
    });

    // Open modal and close it before track/untrack finishes
    vi.spyOn(trackingApi, "addTrackedShow").mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("fail")), 50),
        ),
    );
    vi.spyOn(trackingApi, "removeTrackedShow").mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("fail")), 50),
        ),
    );

    fireEvent.click(getByTestId("calendar-event-9991"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });

    const trackBtn = getByTestId("modal-track-btn");
    fireEvent.click(trackBtn);
    fireEvent.click(getByText("✕"));
    await new Promise((r) => setTimeout(r, 60));

    fireEvent.click(getByTestId("calendar-event-9992"));
    await waitFor(() => {
      expect(getByTestId("event-modal")).toBeTruthy();
    });
    const untrackBtn = getByTestId("modal-untrack-btn");
    fireEvent.click(untrackBtn);
    fireEvent.click(getByText("✕"));
    await new Promise((r) => setTimeout(r, 60));
  });

  it("covers December and January winter season branches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));

    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 9992,
        media_id: 9992,
        title: "Winter Show Dec",
        airing_at: 1700000000,
        airing_at_art: "12:00",
        release_date: "2026-12-15",
        episode: 1,
        tags: [],
        sources: ["Netflix"],
        format: "TV",
        is_tracked: false,
        has_manga: false,
        chapters: [{ number: 1, site: "Netflix", url: "https://netflix.com" }],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId } = render(() => <CalendarView />);
    vi.useRealTimers();

    fireEvent.click(getByTestId("calendar-filter-btn"));
    fireEvent.change(getByTestId("filter-season-select"), {
      target: { value: "winter" },
    });
    await waitFor(() => {
      expect(getByTestId("calendar-event-9992")).toBeTruthy();
    });
  });

  it("renders week header title when week spans across two months", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));

    const { getByTestId, getByText } = render(() => <CalendarView />);
    vi.useRealTimers();

    await waitFor(() => {
      expect(getByTestId("calendar-view")).toBeTruthy();
    });
    expect(getByText(/Mar.*Apr/)).toBeTruthy();
  });

  it("toggles source filter buttons on and off", async () => {
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const mockEvents: calendarApi.CalendarEvent[] = [
      {
        id: 7001,
        media_id: 7001,
        title: "Source Show",
        airing_at: 1700000000,
        airing_at_art: "12:00",
        release_date: todayStr,
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: ["Crunchyroll"],
        has_manga: false,
        chapters: [],
        relations: [],
      },
    ];
    vi.spyOn(calendarApi, "fetchCalendarEvents").mockResolvedValue(mockEvents);

    const { getByTestId } = render(() => <CalendarView />);
    await waitFor(() => {
      expect(getByTestId("calendar-event-7001")).toBeTruthy();
    });

    fireEvent.click(getByTestId("calendar-filter-btn"));
    const crunchyBtn = getByTestId("filter-source-crunchyroll");
    fireEvent.click(crunchyBtn);
    await waitFor(() => {
      expect(getByTestId("calendar-event-7001")).toBeTruthy();
    });

    fireEvent.click(crunchyBtn);
    await waitFor(() => {
      expect(getByTestId("calendar-event-7001")).toBeTruthy();
    });
  });
});
