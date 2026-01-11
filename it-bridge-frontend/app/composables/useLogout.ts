import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { useNotifications } from "~/composables/useNotifications";
import { overdueInvoices, pendingInvoices } from "./api/useInvoiceApi";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useProfileStore } from "~/stores/profileStore";

export const useLogout = () => {
  const tokenStore = useTokenStore();
  const userStore = useUserStore();
  const attendanceStore = useAttendanceStore();
  const childrenStore = useChildrenStore();
  const profileStore = useProfileStore();
  const { info } = useNotifications();

  const handleLogout = () => {
    info("Goodbye!", "You have been logged out successfully.");
    tokenStore.clearTokens();
    userStore.logout();
    attendanceStore.clearAttendance();
    childrenStore.clearChildren();
    profileStore.clearProfile();

    pendingInvoices.value = false;
    overdueInvoices.value = false;
    navigateTo("/");
  };

  return { handleLogout };
};
