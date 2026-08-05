import { describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./apiFetch";

describe("apiFetch", () => {
  it("creates ApiError with default status", () => {
    const err = new ApiError("Failed");
    expect(err.message).toBe("Failed");
    expect(err.code).toBe("API_ERROR");
    expect(err.status).toBe(500);
  });

  it("handles successful JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ hello: "world" }),
      }),
    );

    const res = await apiFetch<{ hello: string }>("http://test.com");
    expect(res).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("handles standard ok:true response object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ ok: true, data: { foo: "bar" } }),
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({ ok: true, data: { foo: "bar" } });
  });

  it("handles text response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        text: async () => "plain text",
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({ ok: true, data: "plain text" });
  });

  it("handles HTTP error response with JSON payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: "BAD_REQ", message: "Invalid payload" }),
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({
      ok: false,
      error: "BAD_REQ",
      message: "Invalid payload",
    });
  });

  it("handles HTTP error response with non-JSON text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({
      ok: false,
      error: "HTTP_500",
      message: "Internal Server Error",
    });
  });

  it("handles HTTP error response when text read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => {
          throw new Error("fail");
        },
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({
      ok: false,
      error: "HTTP_404",
      message: "Request failed with status 404",
    });
  });

  it("handles network error during fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network disconnect")),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({
      ok: false,
      error: "NETWORK_ERROR",
      message: "Network disconnect",
    });
  });

  it("handles non-json response when res.text returns empty string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "",
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({ ok: true, data: "" });
  });

  it("handles json response returning null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => null,
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({ ok: true, data: null });
  });

  it("handles response without headers property", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "no headers content",
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({ ok: true, data: "no headers content" });
  });

  it("handles catch block with thrown object without message property", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        throw {};
      }),
    );

    const res = await apiFetch("http://test.com");
    expect(res).toEqual({
      ok: false,
      error: "NETWORK_ERROR",
      message: "Network request failed",
    });
  });
});
