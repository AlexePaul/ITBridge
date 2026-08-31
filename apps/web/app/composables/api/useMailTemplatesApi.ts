import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  MailTemplateDetail,
  MailTemplateRendered,
  MailTemplateSummary,
  PreviewMailTemplateDto,
  UpdateMailTemplateDto,
} from "~/types/mail.types";

/** The template editor's calls — E17/S2. Admin only, the API enforces it. */
export const useMailTemplatesApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  const fetchTemplates = async () =>
    api<MailTemplateSummary[]>("/mail-templates", { method: "GET", headers: auth() });

  const fetchTemplate = async (key: string) =>
    api<MailTemplateDetail>(`/mail-templates/${key}`, { method: "GET", headers: auth() });

  /**
   * Renders the given (possibly unsaved) fields with the template's sample data. The point of
   * taking a draft: a broken placeholder shows up before it can be saved, not after.
   */
  const previewTemplate = async (key: string, draft: PreviewMailTemplateDto) =>
    api<MailTemplateRendered>(`/mail-templates/${key}/preview`, {
      method: "POST",
      headers: auth(),
      body: draft,
    });

  const saveTemplate = async (key: string, fields: UpdateMailTemplateDto) =>
    api<MailTemplateDetail>(`/mail-templates/${key}`, {
      method: "PUT",
      headers: auth(),
      body: fields,
    });

  /** Back to the code's wording. Deleting the customization is the whole operation. */
  const revertTemplate = async (key: string) =>
    api<MailTemplateDetail>(`/mail-templates/${key}`, { method: "DELETE", headers: auth() });

  return { fetchTemplates, fetchTemplate, previewTemplate, saveTemplate, revertTemplate };
};
