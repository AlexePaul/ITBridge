import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  AnnouncementDetail,
  AnnouncementPreview,
  AnnouncementResult,
  AnnouncementSummary,
  SendAnnouncementDto,
} from "~/types/announcement.types";

/**
 * Announcements — E17/S7. Admin only, all four calls.
 *
 * `preview` and `sendTest` take the same body as `send`, and that is the point: previewing or
 * testing something other than what will go out is the one way either can lie, and the story leans
 * on the preview as the place a child's name gets caught before two hundred families read it.
 */
export const useAnnouncementsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  const fetchAnnouncements = async () =>
    api<AnnouncementSummary[]>("/announcements", { method: "GET", headers: auth() });

  const fetchAnnouncement = async (id: number) =>
    api<AnnouncementDetail>(`/announcements/${id}`, { method: "GET", headers: auth() });

  const previewAnnouncement = async (body: SendAnnouncementDto) =>
    api<AnnouncementPreview>("/announcements/preview", { method: "POST", headers: auth(), body });

  const sendTestAnnouncement = async (body: SendAnnouncementDto) =>
    api<{ to: string }>("/announcements/test", { method: "POST", headers: auth(), body });

  const sendAnnouncement = async (body: SendAnnouncementDto) =>
    api<AnnouncementResult>("/announcements", { method: "POST", headers: auth(), body });

  return {
    fetchAnnouncements,
    fetchAnnouncement,
    previewAnnouncement,
    sendTestAnnouncement,
    sendAnnouncement,
  };
};
