import { type Component, createSignal } from "solid-js";
import { CalendarView } from "./components/CalendarView";
import { ConfigModal } from "./components/ConfigModal";
import {
  ToastContainer,
  type ToastMessage,
  globalToasts,
} from "./components/Toast";
import { TrackedShows } from "./components/TrackedShows";

const App: Component = () => {
  const [activeTab, setActiveTab] = createSignal<"calendar" | "tracking">(
    "calendar",
  );
  const [toasts] = createSignal<ToastMessage[]>([]);
  const [showConfig, setShowConfig] = createSignal(false);
  // Merge local app toasts with global bus toasts
  const allToasts = () => [...toasts(), ...globalToasts()];

  return (
    <div>
      <div>
        <nav class="nav">
          <div class="nav-brand" data-testid="nav-brand">
            <span class="nav-brand-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-label="Anime Pipeline Logo"
              >
                <title>Anime Pipeline Logo</title>
                <path d="M12 2v4" />
                <path d="M6.8 6.8l2.8 2.8" />
                <path d="M17.2 6.8l-2.8 2.8" />
                <circle cx="12" cy="12" r="3" />
                <path d="M10 15l-2 7h8l-2-7" />
              </svg>
            </span>
            <span class="nav-brand-text">Beacon</span>
          </div>
          <div class="nav-tabs">
            <button
              id="tab-calendar"
              data-testid="nav-calendar"
              type="button"
              onClick={() => setActiveTab("calendar")}
              class={`nav-tab${activeTab() === "calendar" ? " active" : ""}`}
            >
              Calendar
            </button>
            <button
              id="tab-tracking"
              data-testid="nav-tracking"
              type="button"
              onClick={() => setActiveTab("tracking")}
              class={`nav-tab${activeTab() === "tracking" ? " active" : ""}`}
            >
              Tracked Shows
            </button>
          </div>
          <button
            id="config-btn"
            data-testid="nav-config-btn"
            type="button"
            class="nav-config-btn"
            aria-label="Configuration"
            onClick={() => setShowConfig(true)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <title>Configuration</title>
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </nav>
        {activeTab() === "calendar" ? <CalendarView /> : <TrackedShows />}
      </div>
      {showConfig() && <ConfigModal onClose={() => setShowConfig(false)} />}
      <ToastContainer toasts={allToasts()} />
    </div>
  );
};

export default App;
