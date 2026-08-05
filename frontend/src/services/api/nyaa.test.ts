import { describe, expect, it, vi } from "vitest";
import { searchCatalog } from "./nyaa";

describe("nyaa service API", () => {
  it("searchCatalog returns items array from backend response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [{ id: "1", title: "Frieren" }],
      }),
    );

    const items = await searchCatalog("Frieren");
    expect(items).toEqual([{ id: "1", title: "Frieren" }]);
  });

  it("searchCatalog returns items from object.items response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ items: [{ id: "2", title: "Bleach" }] }),
      }),
    );

    const items = await searchCatalog("Bleach");
    expect(items).toEqual([{ id: "2", title: "Bleach" }]);
  });

  it("searchCatalog falls back to Jikan API on backend failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Primary and fallback backend endpoints fail
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        // Jikan endpoint succeeds
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [
              {
                mal_id: 10,
                title: "Naruto",
                title_english: "Naruto English",
                images: { jpg: { image_url: "https://img.jpg" } },
                synopsis: "Ninja anime",
                genres: [{ name: "Action" }],
              },
            ],
          }),
        }),
    );

    const items = await searchCatalog("Naruto");
    expect(items).toEqual([
      {
        id: "10",
        title: "Naruto English",
        image_url: "https://img.jpg",
        synopsis: "Ninja anime",
        tags: ["Action"],
        is_torrenteable: true,
      },
    ]);
  });

  it("handles object without items property and Jikan without optional fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      }),
    );

    const items = await searchCatalog("EmptyObject");
    expect(items).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [
              {
                mal_id: 11,
                title: "Raw Title Only",
              },
            ],
          }),
        }),
    );

    const jikanItems = await searchCatalog("RawTitle");
    expect(jikanItems).toEqual([
      {
        id: "11",
        title: "Raw Title Only",
        image_url: undefined,
        synopsis: undefined,
        tags: [],
        is_torrenteable: true,
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ data: null }),
        }),
    );
    const nullJikan = await searchCatalog("NullJikan");
    expect(nullJikan).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => undefined,
        }),
    );
    const emptyJikan = await searchCatalog("EmptyJikan");
    expect(emptyJikan).toEqual([]);
  });
});
