import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { overdueInvoices, pendingInvoices } from "./api/useInvoiceApi";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useClassSessionStore } from "~/stores/classSessionStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useProfileStore } from "~/stores/profileStore";

export const useLogout = () => {
  const tokenStore = useTokenStore();
  const userStore = useUserStore();
  const attendanceStore = useAttendanceStore();
  const classSessionStore = useClassSessionStore();
  const childrenStore = useChildrenStore();
  const profileStore = useProfileStore();
  const authApi = useAuthApi();
  const { info } = useNotifications();

  const handleLogout = async () => {
    // Revoke server-side first, while the refresh token is still in the cookie. Clearing the
    // cookies alone left the session live for seven days.
    await authApi.logout();

    info("Goodbye!", "You have been logged out successfully.");
    tokenStore.clearTokens();
    userStore.logout();
    attendanceStore.clearAttendance();
    classSessionStore.clearSessions();
    childrenStore.clearChildren();
    profileStore.clearProfile();

    pendingInvoices.value = false;
    overdueInvoices.value = false;
    navigateTo("/");
  };

  return { handleLogout };
};
