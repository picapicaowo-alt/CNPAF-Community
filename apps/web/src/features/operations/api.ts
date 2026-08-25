import { apiFetch } from "@/lib/api-client";
import type {
  InviteSummary,
  JobSummary,
  OpsQueueRecord,
  OpsSite,
  ReviewFindingDecision,
  ReviewRecord,
  SafetyFlagSummary,
} from "./types";

export async function listPendingReviewRecords() {
  const result = await apiFetch<{ records?: OpsQueueRecord[] }>("/api/v1/records");
  return (result.records ?? []).filter((record) => record.reviewStatus === "pending");
}

export async function listInvites() {
  const result = await apiFetch<{ invites?: InviteSummary[] }>("/api/v1/invites");
  return result.invites ?? [];
}

export async function createInvite(email: string, role: string) {
  return apiFetch<{ acceptPath?: string }>("/api/v1/invites", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function listSafetyFlags() {
  const result = await apiFetch<{ flags?: SafetyFlagSummary[] }>("/api/v1/safety");
  return result.flags ?? [];
}

export function reviewSafetyFlag(id: string) {
  return apiFetch("/api/v1/safety", {
    method: "PATCH",
    body: JSON.stringify({ id, status: "reviewed" }),
  });
}

export async function listOpsSites() {
  const result = await apiFetch<{ sites?: OpsSite[] }>("/api/v1/sites?q=");
  return result.sites ?? [];
}

export function mergeOpsSite(fromId: string, intoId: string) {
  return apiFetch("/api/v1/sites", {
    method: "PATCH",
    body: JSON.stringify({ fromId, intoId }),
  });
}

export async function listJobs() {
  const result = await apiFetch<{ jobs?: JobSummary[] }>("/api/v1/jobs");
  return result.jobs ?? [];
}

export function processJobs() {
  return apiFetch("/api/v1/jobs", { method: "POST" });
}

export function retryJob(id: string) {
  return apiFetch("/api/v1/jobs", {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
}

export function getReviewRecord(recordId: string) {
  return apiFetch<ReviewRecord>(`/api/v1/records/${recordId}`);
}

export function submitRecordReview(
  recordId: string,
  input: {
    action: "approve" | "needs_completion";
    annotation: string;
    findings: ReviewFindingDecision[];
  },
) {
  return apiFetch(`/api/v1/records/${recordId}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
