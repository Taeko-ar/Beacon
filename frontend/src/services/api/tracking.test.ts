import { describe, expect, it, vi } from "vitest";
import {
  addTrackedShow,
  fetchTrackedShows,
  removeTrackedShow,
  searchNyaaReleases,
} from "./tracking";

describe("tracking service API", () => {
  it("fetchTrackedShows returns array on success and empty array on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [{ id: "1", title: "Frieren", lastDownloaded: 1 }],
      }),
    );

    const shows = await fetchTrackedShows();
    expect(shows).toEqual([{ id: "1", title: "Frieren", lastDownloaded: 1 }]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Error",
      }),
    );
    const emptyShows = await fetchTrackedShows();
    expect(emptyShows).toEqual([]);
  });

  it("addTrackedShow sends POST request and returns boolean with fallback coverage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ ok: true }),
      }),
    );

    const res = await addTrackedShow({
      id: "test",
      title: "Test Show",
      lastDownloaded: 0,
    });
    expect(res).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ ok: true }),
        }),
    );
    const resFallback1 = await addTrackedShow({
      id: "fallback-show",
      title: "Fallback Show",
      lastDownloaded: 0,
    });
    expect(resFallback1).toBe(true);

    const resFallback2 = await addTrackedShow({
      id: "fallback-show",
      title: "Fallback Show Updated",
      lastDownloaded: 1,
    });
    expect(resFallback2).toBe(true);
  });

  it("removeTrackedShow sends DELETE request and handles fallback branches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ ok: true }),
      }),
    );

    const res = await removeTrackedShow("test-id");
    expect(res).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ ok: true }),
        }),
    );
    const remFallback1 = await removeTrackedShow("fallback-show");
    expect(remFallback1).toBe(true);

    const remFallback2 = await removeTrackedShow("non-existent-show");
    expect(remFallback2).toBe(true);
  });

  it("searchNyaaReleases fetches releases and returns array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [
          { title: "Test Release", magnet_link: "magnet:?xt=urn:btih:123" },
        ],
      }),
    );

    const res = await searchNyaaReleases("Test");
    expect(res).toEqual([
      { title: "Test Release", magnet_link: "magnet:?xt=urn:btih:123" },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Error",
      }),
    );
    const failRes = await searchNyaaReleases("FailQuery");
    expect(failRes).toEqual([]);
  });
});
