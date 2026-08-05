import { type Component, For, createSignal } from "solid-js";

export interface ToastMessage {
  id: string;
  text: string;
  type: "info" | "success" | "error";
}

// Global toast bus — any component can call showToast(); App renders the container.
const [_globalToasts, _setGlobalToasts] = createSignal<ToastMessage[]>([]);

export const globalToasts = _globalToasts;

export function showToast(
  text: string,
  type: "info" | "success" | "error" = "success",
  durationMs = 3000,
) {
  const id = `${Date.now()}-${Math.random()}`;
  _setGlobalToasts((prev) => [...prev, { id, text, type }]);
  setTimeout(() => {
    _setGlobalToasts((prev) => prev.filter((t) => t.id !== id));
  }, durationMs);
}

interface ToastContainerProps {
  toasts: ToastMessage[];
}

export const ToastContainer: Component<ToastContainerProps> = (props) => {
  return (
    <div class="toast-wrap">
      <For each={props.toasts}>
        {(toast) => (
          <div class={`toast-message toast-${toast.type}`}>{toast.text}</div>
        )}
      </For>
    </div>
  );
};
