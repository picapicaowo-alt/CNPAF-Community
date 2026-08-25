import { apiFetch } from "@/lib/api-client";
import type {
  MembershipRole,
  PersonChoice,
  Program,
  ProgramBundle,
  ProgramDraft,
  ProgramDetailsDraft,
} from "./types";

export function listPrograms() {
  return apiFetch<{ programs: Program[] }>("/api/v1/programs");
}

export function getProgram(programId: string) {
  return apiFetch<ProgramBundle>(`/api/v1/programs/${programId}`);
}

export function createProgram(
  organizationId: string,
  draft: ProgramDraft,
) {
  return apiFetch<{ program: Program }>("/api/v1/programs", {
    method: "POST",
    body: JSON.stringify({
      organizationId,
      key: draft.key,
      nameEn: draft.nameEn.trim(),
      nameZh: draft.nameZh.trim(),
      descriptionEn: draft.descriptionEn.trim() || null,
      descriptionZh: draft.descriptionZh.trim() || null,
      status: "active",
      configuration: {},
    }),
  });
}

export function transitionProgram(
  programId: string,
  status: "active" | "completed" | "archived",
) {
  return apiFetch<{ program: Program }>(`/api/v1/programs/${programId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateProgramDetails(
  programId: string,
  draft: ProgramDetailsDraft,
) {
  return apiFetch<{ program: Program }>(`/api/v1/programs/${programId}`, {
    method: "PATCH",
    body: JSON.stringify({
      nameEn: draft.nameEn.trim(),
      nameZh: draft.nameZh.trim(),
      descriptionEn: draft.descriptionEn.trim() || null,
      descriptionZh: draft.descriptionZh.trim() || null,
    }),
  });
}

export function addProgramMembers(
  programId: string,
  userIds: string[],
  membershipRoleKey: string,
) {
  return apiFetch(`/api/v1/programs/${programId}/memberships`, {
    method: "POST",
    body: JSON.stringify({ userIds, membershipRoleKey }),
  });
}

export function removeProgramMember(programId: string, membershipId: string) {
  return apiFetch(
    `/api/v1/programs/${programId}/memberships/${membershipId}`,
    { method: "DELETE" },
  );
}

export function listProgramPeople() {
  return apiFetch<{ users: PersonChoice[] }>("/api/v1/admin/users?limit=250");
}

export function listMembershipRoles() {
  return apiFetch<{ items: MembershipRole[] }>(
    "/api/v1/config/registries/program_membership_role",
  );
}
