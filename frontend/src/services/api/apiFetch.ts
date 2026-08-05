export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "API_ERROR", status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = res.text ? await res.text().catch(() => "") : "";
      let parsed: ApiResponse<T> | null = null;
      try {
        parsed = JSON.parse(errText);
      } catch {
        // Ignored
      }
      return {
        ok: false,
        error: parsed?.error || `HTTP_${res.status}`,
        message:
          parsed?.message ||
          errText ||
          `Request failed with status ${res.status}`,
      };
    }
    const contentType = res.headers?.get?.("content-type");
    if (contentType?.includes("application/json")) {
      const data = await res.json();
      if (typeof data === "object" && data !== null && "ok" in data) {
        return data as ApiResponse<T>;
      }
      return { ok: true, data: data as T };
    }
    const textData = await res.text().catch(() => "");
    return { ok: true, data: textData as unknown as T };
  } catch (err: unknown) {
    const errorObj = err as Error;
    return {
      ok: false,
      error: "NETWORK_ERROR",
      message: errorObj?.message || "Network request failed",
    };
  }
}

const FALLBACK_BASE =
  // biome-ignore lint/suspicious/noExplicitAny: Vite meta typing
  (import.meta as any).env?.VITE_API_FALLBACK_URL || "";

export async function apiFetchWithFallback<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const res = await apiFetch<T>(path, options);
  if (res.ok) return res;
  return apiFetch<T>(`${FALLBACK_BASE}${path}`, options);
}
