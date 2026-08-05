import { fireEvent, render } from "solid-testing-library";
import { describe, expect, it, vi } from "vitest";
import * as calendarApi from "../services/api/calendar";
import { ConfigModal } from "./ConfigModal";

describe("ConfigModal Component", () => {
  it("renders configuration options and handles close button", () => {
    const handleClose = vi.fn();
    const { getByTestId, getByText } = render(() => (
      <ConfigModal onClose={handleClose} />
    ));

    expect(getByText("Application Configuration")).toBeTruthy();
    expect(getByText("Refetch Pipeline & Cache")).toBeTruthy();

    const closeBtn = getByTestId("config-modal-close");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("handles refetch action success and failure", async () => {
    vi.spyOn(calendarApi, "clearCalendarCache").mockResolvedValueOnce(true);

    const handleClose = vi.fn();
    const { getByTestId, getByText } = render(() => (
      <ConfigModal onClose={handleClose} />
    ));

    const refetchBtn = getByTestId("config-refetch-btn");
    fireEvent.click(refetchBtn);

    await vi.waitFor(() => {
      expect(getByText("Configuration refetched successfully!")).toBeTruthy();
    });

    vi.spyOn(calendarApi, "clearCalendarCache").mockRejectedValueOnce(
      new Error("Fail"),
    );
    fireEvent.click(refetchBtn);
    await vi.waitFor(() => {
      expect(getByText("Failed to refetch configuration.")).toBeTruthy();
    });
  });

  it("handles backdrop click to close modal", () => {
    const handleClose = vi.fn();
    const { getByTestId } = render(() => <ConfigModal onClose={handleClose} />);

    const overlay = getByTestId("config-modal-overlay");
    fireEvent.click(overlay);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
