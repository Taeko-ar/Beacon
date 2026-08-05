import { fireEvent, render } from "solid-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App Component", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true, data: [] }),
    });
  });

  it("renders calendar view by default", () => {
    const { getByText, getByTestId, queryByText } = render(() => <App />);
    expect(queryByText("Library")).toBeNull();
    expect(getByText("Tracked Shows")).toBeTruthy();
    expect(getByText("Calendar")).toBeTruthy();
    expect(getByTestId("calendar-view")).toBeTruthy();
    expect(getByTestId("nav-brand")).toBeTruthy();
    expect(getByText("Beacon")).toBeTruthy();
  });

  it("navigates tabs between calendar and tracked shows", () => {
    const { getByText, getByRole, getByTestId } = render(() => <App />);

    expect(getByText("Tracked Shows")).toBeTruthy();
    expect(getByText("Calendar")).toBeTruthy();
    expect(getByTestId("calendar-view")).toBeTruthy();

    // Switch tab to Tracked Shows
    const trackingTab = getByRole("button", { name: "Tracked Shows" });
    fireEvent.click(trackingTab);
    expect(getByRole("heading", { name: "Tracked Shows" })).toBeTruthy();

    // Switch tab to Calendar
    const calendarTab = getByRole("button", { name: "Calendar" });
    fireEvent.click(calendarTab);
    expect(getByTestId("calendar-view")).toBeTruthy();
  });

  it("opens and closes config modal via navbar icon button", () => {
    const { getByTestId, queryByTestId } = render(() => <App />);
    expect(queryByTestId("config-modal")).toBeNull();

    const configBtn = getByTestId("nav-config-btn");
    fireEvent.click(configBtn);
    expect(getByTestId("config-modal")).toBeTruthy();

    const closeBtn = getByTestId("config-modal-close");
    fireEvent.click(closeBtn);
    expect(queryByTestId("config-modal")).toBeNull();
  });
});
