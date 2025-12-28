import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { useNotifications } from "~/composables/useNotifications";

export const useLogout = () => {
  const tokenStore = useTokenStore();
  const userStore = useUserStore();
  const { info } = useNotifications();

  const handleLogout = () => {
    info("Goodbye!", "You have been logged out successfully.");
    tokenStore.clearTokens();
    userStore.logout();
    navigateTo("/");
  };

  return { handleLogout };
};
