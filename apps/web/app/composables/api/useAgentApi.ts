import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { AgentStatus, UnassignedFile } from "~/types/project.types";

/**
 * How long an agent may stay quiet before the interface says something is wrong.
 *
 * Three hours, which is E14's own number. It is deliberately much longer than the few minutes
 * between heartbeats: a machine that reboots for updates should not raise an alarm, and a school
 * afternoon is long enough that a genuinely dead agent still gets noticed the same day.
 */
export const AGENT_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/** True when the last heartbeat is old enough that "no uploads today" stops meaning "a quiet day". */
export function isAgentStale(agent: AgentStatus, now: Date = new Date()): boolean {
  return now.getTime() - new Date(agent.lastSeenAt).getTime() > AGENT_STALE_AFTER_MS;
}

/** How long ago, in Romanian, for the status line. */
export function lastSeenLabel(agent: AgentStatus, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(agent.lastSeenAt).getTime()) / 60000);
  if (minutes < 2) return "chiar acum";
  if (minutes < 60) return `acum ${minutes} de minute`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} ${hours === 1 ? "oră" : "ore"}`;
  const days = Math.round(hours / 24);
  return `acum ${days} ${days === 1 ? "zi" : "zile"}`;
}

/**
 * The upload agent, from the interface's side. E14/S2.
 *
 * The screens read two things: whether the office computer is still reporting, and which files it
 * could not place. Both exist because the failure mode of a single agent is silence, and silence
 * looks exactly like a day when nobody built anything.
 */
export const useAgentApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const authHeader = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  const fetchStatuses = async () =>
    api<AgentStatus[]>("/agent/status", { method: "GET", headers: authHeader() });

  const fetchUnassigned = async (groupId?: number) =>
    api<UnassignedFile[]>("/agent/unassigned", {
      method: "GET",
      headers: authHeader(),
      query: groupId ? { groupId } : {},
    });

  const resolveUnassigned = async (id: number) =>
    api<UnassignedFile>(`/agent/unassigned/${id}/resolve`, {
      method: "PUT",
      headers: authHeader(),
    });

  return { fetchStatuses, fetchUnassigned, resolveUnassigned };
};
