import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import { clearCalendarCache } from "../services/api/calendar";

export interface ConfigModalProps {
  onClose: () => void;
}

export const ConfigModal: Component<ConfigModalProps> = (props) => {
  const [isRefetching, setIsRefetching] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);

  const handleRefetch = async () => {
    setIsRefetching(true);
    setMessage(null);
    try {
      await clearCalendarCache();
      setMessage("Configuration refetched successfully!");
    } catch {
      setMessage("Failed to refetch configuration.");
    } finally {
      setIsRefetching(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop click dismiss handler
    <div
      class="config-modal-overlay"
      data-testid="config-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="config-modal" data-testid="config-modal">
        <div class="config-modal-header">
          <h2>Application Configuration</h2>
          <button
            type="button"
            class="config-modal-close"
            data-testid="config-modal-close"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>
        <div class="config-modal-body">
          <div class="config-item">
            <div>
              <div class="config-item-title">Refetch Pipeline & Cache</div>
              <div class="config-item-desc">
                Force refetch tracked shows, RSS feeds, and calendar metadata
                from sources.
              </div>
            </div>
            <button
              type="button"
              class="config-action-btn"
              data-testid="config-refetch-btn"
              disabled={isRefetching()}
              onClick={handleRefetch}
            >
              {isRefetching() ? "Refetching..." : "Refetch Now"}
            </button>
          </div>
          {message() && (
            <div
              class="config-modal-message"
              data-testid="config-modal-message"
            >
              {message()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
