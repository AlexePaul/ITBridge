// composables/useNotifications.ts
const notifications = ref<
  Array<{
    id: string;
    type: "success" | "error" | "info";
    title: string;
    description?: string;
  }>
>([]);

export const useNotifications = () => {
  const addNotification = (
    type: "success" | "error" | "info",
    title: string,
    description?: string,
    duration = 3000
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    notifications.value.push({ id, type, title, description });

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  };

  const removeNotification = (id: string) => {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  };

  const success = (title: string, description?: string) =>
    addNotification("success", title, description);

  const error = (title: string, description?: string) =>
    addNotification("error", title, description);

  const info = (title: string, description?: string) => addNotification("info", title, description);

  return {
    notifications: readonly(notifications),
    addNotification,
    removeNotification,
    success,
    error,
    info,
  };
};
