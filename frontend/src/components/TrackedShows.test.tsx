import { fireEvent, render } from "solid-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../services/api/calendar";
import { ShowDetailModal } from "./ShowDetailModal";
import { TrackedShows, formatNextEpisodeDate } from "./TrackedShows";

import type { TrackedShowItem } from "./TrackedShows";

describe("TrackedShows Component", () => {
  let mockShows: TrackedShowItem[] = [];

  beforeEach(() => {
    mockShows = [
      {
        id: "frieren",
        title: "Frieren: Beyond Journey's End",
        subgroup: "SubsPlease",
        resolution: "1080p",
        lastDownloaded: 5,
      },
    ];

    global.fetch = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url || "";
        if (url.includes("/api/calendar")) {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () =>
              Promise.resolve([
                {
                  id: 101,
                  media_id: 101,
                  title: "Frieren: Beyond Journey's End",
                  airing_at: 1700000000,
                  airing_at_art: "2026-08-05 18:00 (ART)",
                  release_date: "2026-08-05",
                  episode: 6,
                  description: "Frieren adventures.",
                  tags: ["Fantasy", "Adventure"],
                  format: "TV",
                  is_tracked: true,
                  sources: ["Crunchyroll"],
                  has_manga: true,
                  chapters: [],
                  relations: [],
                },
              ]),
          } as Response);
        }
        if (url.includes("/api/track")) {
          if (init && init.method === "POST" && init.body) {
            const body = JSON.parse(init.body as string);
            mockShows.push(body);
            return Promise.resolve({
              ok: true,
              headers: new Headers({ "content-type": "application/json" }),
              json: () => Promise.resolve(body),
            } as Response);
          }
          if (init && init.method === "DELETE") {
            const parts = url.split("/");
            const id = parts[parts.length - 1];
            mockShows = mockShows.filter((s) => s.id !== id);
            return Promise.resolve({
              ok: true,
              headers: new Headers({ "content-type": "application/json" }),
              json: () => Promise.resolve({ status: "removed" }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () => Promise.resolve([...mockShows]),
          } as Response);
        }
        if (url.includes("/api/search")) {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () => Promise.resolve([]),
          } as Response);
        }
        return Promise.reject(new Error("unknown URL"));
      });
  });

  it("renders list of existing tracked shows with next episode info", async () => {
    const { findByText, getByTestId } = render(() => <TrackedShows />);

    expect(await findByText("Frieren: Beyond Journey's End")).toBeTruthy();
    expect(getByTestId("tracked-row-frieren")).toBeTruthy();
    expect(await findByText(/Ep 6: Tuesday, November 14, 2023/)).toBeTruthy();
  });

  it("selects upcoming episode over past episode when calendar contains multiple episodes", async () => {
    const futureSec = 1786111200;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/calendar")) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: () =>
            Promise.resolve([
              {
                id: 1,
                media_id: 1,
                title: "Frieren: Beyond Journey's End",
                airing_at: 1000000000,
                episode: 12,
                tags: [],
                format: "TV",
                is_tracked: true,
                sources: [],
                has_manga: false,
                chapters: [],
                relations: [],
              },
              {
                id: 2,
                media_id: 1,
                title: "Frieren: Beyond Journey's End",
                airing_at: futureSec,
                airing_at_art: "2026-08-07 11:00 (ART)",
                episode: 13,
                tags: [],
                format: "TV",
                is_tracked: true,
                sources: [],
                has_manga: false,
                chapters: [],
                relations: [],
              },
            ]),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockShows),
      } as Response);
    });

    const { findByText } = render(() => <TrackedShows />);
    expect(await findByText(/Ep 13: Friday, August 7, 2026/)).toBeTruthy();
  });

  it("opens add show modal and adds a new show", async () => {
    const {
      findByText,
      getByTestId,
      getByPlaceholderText,
      getByRole,
      getByDisplayValue,
    } = render(() => <TrackedShows />);

    expect(await findByText("Frieren: Beyond Journey's End")).toBeTruthy();

    const addShowModalBtn = getByTestId("add-show-modal-btn");
    fireEvent.click(addShowModalBtn);

    expect(getByTestId("add-show-modal")).toBeTruthy();

    const titleInput = getByPlaceholderText("e.g. Solo Leveling");
    fireEvent.input(titleInput, { target: { value: "Kaiju No. 8" } });

    const subgroupInput = getByDisplayValue("SubsPlease");
    fireEvent.input(subgroupInput, { target: { value: "HorribleSubs" } });

    const resSelect = getByDisplayValue("1080p");
    fireEvent.change(resSelect, { target: { value: "720p" } });

    const submitBtn = getByRole("button", { name: "Track Show" });
    fireEvent.click(submitBtn);

    expect(await findByText("Kaiju No. 8")).toBeTruthy();
  });

  it("untracks a show on clicking Untrack button", async () => {
    const { findByText, getByTestId, queryByText } = render(() => (
      <TrackedShows />
    ));

    expect(await findByText("Frieren: Beyond Journey's End")).toBeTruthy();

    const untrackBtn = getByTestId("untrack-btn-frieren");
    fireEvent.click(untrackBtn);

    await vi.waitFor(() => {
      expect(queryByText("Frieren: Beyond Journey's End")).toBeNull();
    });
  });

  it("opens show detail modal on clicking show title", async () => {
    const { findByText, getByTestId, queryByTestId } = render(() => (
      <TrackedShows />
    ));

    expect(await findByText("Frieren: Beyond Journey's End")).toBeTruthy();

    const titleBtn = getByTestId("show-title-frieren");
    fireEvent.click(titleBtn);

    expect(getByTestId("event-modal")).toBeTruthy();
    expect(await findByText("Frieren adventures.")).toBeTruthy();

    const closeBtn = getByTestId("event-modal").querySelector(
      ".btn-modal-close",
    ) as HTMLElement;
    fireEvent.click(closeBtn);

    expect(queryByTestId("event-modal")).toBeNull();
  });

  it("filters currently tracked shows by title and filter popover", async () => {
    mockShows = [
      {
        id: "frieren",
        title: "Frieren: Beyond Journey's End",
        subgroup: "SubsPlease",
        resolution: "1080p",
        lastDownloaded: 5,
      },
      {
        id: "bleach",
        title: "Bleach: TYBW",
        subgroup: "SubsPlease",
        resolution: "1080p",
        lastDownloaded: 0,
      },
    ];

    const { getByTestId, findByText, queryByText } = render(() => (
      <TrackedShows />
    ));
    expect(await findByText("Frieren: Beyond Journey's End")).toBeTruthy();
    expect(await findByText("Bleach: TYBW")).toBeTruthy();

    const filterInput = getByTestId("tracked-search-input");
    fireEvent.input(filterInput, { target: { value: "bleach" } });

    expect(queryByText("Frieren: Beyond Journey's End")).toBeNull();
    expect(queryByText("Bleach: TYBW")).toBeTruthy();

    fireEvent.input(filterInput, { target: { value: "" } });
    expect(await findByText("Frieren: Beyond Journey's End")).toBeTruthy();

    // Open popover
    const popoverBtn = getByTestId("filter-popover-btn");
    fireEvent.click(popoverBtn);
    expect(getByTestId("filter-popover")).toBeTruthy();
  });

  describe("formatNextEpisodeDate helper", () => {
    it("returns 'No scheduled release' if event is undefined", () => {
      expect(formatNextEpisodeDate(undefined)).toBe("No scheduled release");
    });

    it("formats airing_at timestamp into full day, month, date, time", () => {
      const ev = {
        episode: 3,
        airing_at: 1700000000,
      } as CalendarEvent;
      const res = formatNextEpisodeDate(ev);
      expect(res).toContain("Ep 3:");
      expect(res).toContain("2023");
      expect(res).toContain("(ART)");
    });

    it("formats airing_at_art formatted string", () => {
      const ev = {
        episode: 4,
        airing_at_art: "2026-08-05 18:00 (ART)",
      } as CalendarEvent;
      expect(formatNextEpisodeDate(ev)).toBe(
        "Ep 4: Wednesday, August 5, 2026 at 18:00 (ART)",
      );
    });

    it("formats airing_at_art fallback string", () => {
      const ev = {
        episode: 4,
        airing_at_art: "TBD Next Season",
      } as CalendarEvent;
      expect(formatNextEpisodeDate(ev)).toBe("Ep 4: TBD Next Season");
    });

    it("formats release_date date string", () => {
      const ev = {
        episode: 5,
        release_date: "2026-10-12",
      } as CalendarEvent;
      expect(formatNextEpisodeDate(ev)).toBe("Ep 5: Monday, October 12, 2026");
    });

    it("formats release_date fallback string", () => {
      const ev = {
        episode: 5,
        release_date: "Unknown Date",
      } as CalendarEvent;
      expect(formatNextEpisodeDate(ev)).toBe("Ep 5: Unknown Date");
    });

    it("handles missing episode number and empty event object", () => {
      expect(formatNextEpisodeDate({} as CalendarEvent)).toBe(
        "No scheduled release",
      );
      expect(
        formatNextEpisodeDate({
          airing_at: 0,
        } as CalendarEvent),
      ).toBe("No scheduled release");
      expect(
        formatNextEpisodeDate({
          airing_at_art: "2026-08-05",
        } as CalendarEvent),
      ).toBe("Wednesday, August 5, 2026");
      expect(
        formatNextEpisodeDate({
          episode: 4,
          airing_at_art: "2026-08-05",
        } as CalendarEvent),
      ).toBe("Ep 4: Wednesday, August 5, 2026");
      expect(
        formatNextEpisodeDate({
          airing_at_art: "Raw Text",
        } as CalendarEvent),
      ).toBe("Raw Text");
      expect(
        formatNextEpisodeDate({
          airing_at: 1700000000,
        } as CalendarEvent),
      ).not.toContain("Ep");
      expect(
        formatNextEpisodeDate({
          episode: 0,
          airing_at: 1700000000,
        } as CalendarEvent),
      ).not.toContain("Ep 0:");
      expect(
        formatNextEpisodeDate({
          release_date: "2026-10-12",
        } as CalendarEvent),
      ).toBe("Monday, October 12, 2026");
      expect(
        formatNextEpisodeDate({
          episode: 5,
          release_date: "2026-10-12",
        } as CalendarEvent),
      ).toBe("Ep 5: Monday, October 12, 2026");
      expect(
        formatNextEpisodeDate({
          release_date: "invalid-date",
        } as CalendarEvent),
      ).toBe("invalid-date");
      expect(
        formatNextEpisodeDate({
          episode: 5,
          release_date: "invalid-date",
        } as CalendarEvent),
      ).toBe("Ep 5: invalid-date");
      expect(
        formatNextEpisodeDate({
          episode: 0,
          release_date: "2026-10-12",
        } as CalendarEvent),
      ).toBe("Monday, October 12, 2026");
      expect(
        formatNextEpisodeDate({
          episode: 0,
          release_date: "Unknown Date",
        } as CalendarEvent),
      ).toBe("Unknown Date");
    });
  });

  describe("ShowDetailModal Component", () => {
    it("renders nothing when event is null", () => {
      const { queryByTestId } = render(() => (
        <ShowDetailModal event={null} onClose={vi.fn()} />
      ));
      expect(queryByTestId("event-modal")).toBeNull();
    });

    it("renders modal content and triggers track toggle button", async () => {
      const mockEvent: CalendarEvent = {
        id: 1,
        media_id: 1,
        title: "Test Modal Anime",
        airing_at: 1700000000,
        airing_at_art: "2026-08-05 18:00 (ART)",
        release_date: "2026-08-05",
        episode: 1,
        description: "Test description",
        tags: ["Action"],
        format: "TV",
        is_tracked: false,
        sources: ["Crunchyroll"],
        has_manga: false,
        chapters: [
          { number: 1, site: "Crunchyroll", url: "https://crunchyroll.com" },
        ],
        relations: [],
      };
      const onTrackToggle = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const { getByTestId } = render(() => (
        <ShowDetailModal
          event={mockEvent}
          onClose={onClose}
          onTrackToggle={onTrackToggle}
        />
      ));

      const trackBtn = getByTestId("modal-track-btn");
      fireEvent.click(trackBtn);
      expect(onTrackToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
    });

    it("copies title in ShowDetailModal on copy button click", async () => {
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextSpy },
      });

      const mockEvent: CalendarEvent = {
        id: 2,
        media_id: 2,
        title: "Copy Modal Anime",
        airing_at: 1700000000,
        airing_at_art: "2026-08-05 18:00 (ART)",
        release_date: "2026-08-05",
        episode: 1,
        tags: [],
        format: "TV",
        is_tracked: false,
        sources: [],
        has_manga: false,
        chapters: [],
        relations: [],
      };

      const { getByTestId } = render(() => (
        <ShowDetailModal event={mockEvent} onClose={vi.fn()} />
      ));

      const copyBtn = getByTestId("copy-title-btn");
      fireEvent.click(copyBtn);
      expect(writeTextSpy).toHaveBeenCalledWith("Copy Modal Anime");
    });
  });
});
