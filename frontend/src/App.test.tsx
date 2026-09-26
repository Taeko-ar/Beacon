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
    const { getByText, getByTestId } = render(() => <App />);
    expect(getByText("Library")).toBeTruthy();
    expect(getByText("Calendar")).toBeTruthy();
    expect(getByTestId("calendar-view")).toBeTruthy();
    expect(getByTestId("nav-brand")).toBeTruthy();
    expect(getByText("Beacon")).toBeTruthy();
  });

  it("navigates tabs between calendar and library", () => {
    const { getByText, getByRole, getByTestId } = render(() => <App />);

    expect(getByText("Calendar")).toBeTruthy();
    expect(getByText("Library")).toBeTruthy();
    expect(getByTestId("calendar-view")).toBeTruthy();

    // Switch tab to Library
    const libraryTab = getByRole("button", { name: "Library" });
    fireEvent.click(libraryTab);
    expect(getByTestId("library-view")).toBeTruthy();

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
