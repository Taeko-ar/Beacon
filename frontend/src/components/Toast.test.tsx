import { render, waitFor } from "solid-testing-library";
import { describe, expect, it, vi } from "vitest";
import { ToastContainer, globalToasts, showToast } from "./Toast";

describe("ToastContainer Component", () => {
  it("renders toast messages with correct styling classes", () => {
    const toasts = [
      { id: "1", text: "Success Toast", type: "success" as const },
      { id: "2", text: "Error Toast", type: "error" as const },
      { id: "3", text: "Info Toast", type: "info" as const },
    ];
    const { getByText } = render(() => <ToastContainer toasts={toasts} />);

    expect(getByText("Success Toast")).toBeTruthy();
    expect(getByText("Error Toast")).toBeTruthy();
    expect(getByText("Info Toast")).toBeTruthy();
  });

  it("showToast adds and auto-removes a toast after durationMs", async () => {
    vi.useFakeTimers();
    showToast("Auto remove me", "info", 500);
    expect(globalToasts().some((t) => t.text === "Auto remove me")).toBe(true);
    vi.advanceTimersByTime(600);
    await waitFor(() => {
      expect(globalToasts().some((t) => t.text === "Auto remove me")).toBe(
        false,
      );
    });
    vi.useRealTimers();
  });
});
