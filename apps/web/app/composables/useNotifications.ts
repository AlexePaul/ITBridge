type NotificationType = "success" | "error" | "info";

const COLORS = { success: "success", error: "error", info: "info" } as const;
const ICONS = {
  success: "i-lucide-circle-check",
  error: "i-lucide-circle-alert",
  info: "i-lucide-info",
} as const;

/**
 * How long each kind stays, in milliseconds. Hovering or focusing a toast pauses the clock.
 *
 * An error stays long enough to be read out, not just glimpsed: it is where the code of a server
 * error appears („cod 3f2a9c1d"), and the runbook's first step for a bug is to copy that code. The
 * old container dismissed every toast after three seconds — and on the mouse entering it, so moving
 * the pointer to select the code made it vanish.
 */
const DURATIONS: Record<NotificationType, number> = { success: 4000, error: 15000, info: 6000 };

/**
 * The screens' toasts, shown by Nuxt UI's toaster (`UApp` renders it).
 *
 * They used to be drawn by a container of our own inside the app root, which Nuxt UI makes an
 * isolated stacking context — so whatever z-index it had, a modal teleported to `<body>` sat on top
 * of it, and an error from a modal's own button came up dimmed under the modal's overlay (QA of 27
 * September 2026). Nuxt UI's toaster is teleported too, above the overlay, pauses while hovered and
 * has a close button. The API the screens call is unchanged.
 *
 * Called in `<script setup>` (or in a composable called there), like every `use*`: the toaster is
 * reached once, here, so the returned functions can be called after an `await`.
 */
export const useNotifications = () => {
  const toast = useToast();

  const notify = (type: NotificationType, title: string, description?: string) =>
    toast.add({
      title,
      description,
      color: COLORS[type],
      icon: ICONS[type],
      duration: DURATIONS[type],
    });

  const success = (title: string, description?: string) => notify("success", title, description);
  const error = (title: string, description?: string) => notify("error", title, description);
  const info = (title: string, description?: string) => notify("info", title, description);

  return { success, error, info };
};
