import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { Child } from "~/types/child.types";
import type {
  PendingProjectsSummary,
  Project,
  ProjectStatus,
  SendProjectsResult,
} from "~/types/project.types";

/** Query for `GET /projects`. Every field optional; the server decides what a caller may see. */
export interface ProjectFilters {
  groupId?: number;
  childId?: number;
  status?: ProjectStatus;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Everything the screens need from E14.
 *
 * Two rules worth knowing before calling any of this:
 *
 *  - **A parent's list is narrowed by the server, not here.** Another group's id comes back as an
 *    empty array rather than a 403, so an empty list never means "something went wrong".
 *  - **A file is never linked to directly.** `fileDownloadUrl` asks the backend, which checks the
 *    child belongs to the caller and only then signs a short-lived URL. A storage URL never appears
 *    in a page, an email or a log.
 */
export const useProjectsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const authHeader = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /**
   * Undefined filters are stripped rather than sent: `?groupId=undefined` reaches the API as the
   * string "undefined", and implicit conversion is off there, so it is a 400 rather than the
   * "no filter" the caller meant.
   */
  /**
   * How much is waiting to be sent, and for how long — E17/S8.
   *
   * Asked of the server rather than counted here from a list of every `new` project, which is what
   * the projects screen used to do: counting in the browser is a second definition of the number,
   * it cannot produce an age, and it downloads the whole backlog to find out how big the backlog is.
   */
  const fetchPendingProjects = async () =>
    api<PendingProjectsSummary>("/projects/pending", { method: "GET", headers: authHeader() });

  const fetchProjects = async (filters: ProjectFilters = {}) => {
    const query = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")
    );

    return api<Project[]>("/projects", { method: "GET", headers: authHeader(), query });
  };

  /** What the link in a parent's email opens. 403 when it is another family's, never a blank page. */
  const fetchByPublicId = async (publicId: string) =>
    api<Project>(`/projects/link/${encodeURIComponent(publicId)}`, {
      method: "GET",
      headers: authHeader(),
    });

  /**
   * A short-lived download URL for one file.
   *
   * Two hops on purpose: the first is authenticated and authorised, the second is a signed URL the
   * browser follows immediately. The signed URL carries `Content-Disposition: attachment`, so a
   * file that came off a network share is always saved and never rendered.
   */
  const fileDownloadUrl = async (projectId: number, fileId: number) =>
    api<{ url: string; filename: string }>(`/projects/${projectId}/files/${fileId}`, {
      method: "GET",
      headers: authHeader(),
    });

  /**
   * The thumbnail, as an object URL.
   *
   * It cannot be a plain `<img src="/projects/1/thumbnail">`: the endpoint needs the bearer token,
   * and a browser does not send one on an image request. So the bytes are fetched like any other
   * call and handed to the page as a blob URL.
   *
   * The caller owns the URL and must revoke it — `URL.createObjectURL` keeps the blob alive until
   * somebody does, and a gallery that scrolls through a term's worth of work would otherwise hold
   * every thumbnail it has ever shown.
   */
  const fetchThumbnail = async (projectId: number): Promise<string> => {
    const blob = await api<Blob>(`/projects/${projectId}/thumbnail`, {
      method: "GET",
      headers: authHeader(),
      responseType: "blob",
    });
    return URL.createObjectURL(blob);
  };

  /**
   * Queues one email per parent for the ticked documents. E14/S4.
   *
   * The answer is a report, not a delivery confirmation: it says what was queued, what was skipped
   * because it had already gone out, and which parents have no address to write to. Pressing the
   * button twice sends nothing the second time.
   */
  const sendProjects = async (projectIds: number[]) =>
    api<SendProjectsResult>("/projects/send", {
      method: "POST",
      headers: authHeader(),
      body: { projectIds },
    });

  const reassignProject = async (projectId: number, childId: number) =>
    api<Project>(`/projects/${projectId}/reassign`, {
      method: "PUT",
      headers: authHeader(),
      body: { childId },
    });

  const deleteProject = async (projectId: number) =>
    api<{ deleted: boolean }>(`/projects/${projectId}`, {
      method: "DELETE",
      headers: authHeader(),
    });

  /** A parent saying a document does not look like their child's work. Queues a note to the office. */
  const reportProject = async (publicId: string, note?: string) =>
    api<{ reported: boolean }>(`/projects/link/${encodeURIComponent(publicId)}/report`, {
      method: "POST",
      headers: authHeader(),
      body: { note },
    });

  /** Children in the group with nothing on that day — a nudge while the class is still in the room. */
  const childrenWithoutProjects = async (groupId: number, on: string) =>
    api<Child[]>(`/projects/group/${groupId}/missing`, {
      method: "GET",
      headers: authHeader(),
      query: { on },
    });

  /** A project made of links, typed in from the group screen. */
  const createLinkProject = async (payload: {
    childId: number;
    capturedOn: string;
    title: string;
    description?: string;
    links: { label: string; url: string }[];
  }) => api<Project>("/projects", { method: "POST", headers: authHeader(), body: payload });

  return {
    fetchPendingProjects,
    fetchProjects,
    fetchByPublicId,
    fileDownloadUrl,
    fetchThumbnail,
    sendProjects,
    reassignProject,
    deleteProject,
    reportProject,
    childrenWithoutProjects,
    createLinkProject,
  };
};
