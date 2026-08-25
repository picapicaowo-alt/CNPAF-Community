import { apiFetch } from "@/lib/api-client";
import type { PeopleGroup, PeopleGroupDraft } from "./types";

export function listPeopleGroups() {
  return apiFetch<{ groups: PeopleGroup[] }>("/api/v1/people-groups");
}

export function createPeopleGroup(
  key: string,
  draft: PeopleGroupDraft,
) {
  return apiFetch<{ group: PeopleGroup }>("/api/v1/people-groups", {
    method: "POST",
    body: JSON.stringify({
      key,
      nameEn: draft.nameEn.trim(),
      nameZh: draft.nameZh.trim(),
      descriptionEn: draft.descriptionEn.trim() || null,
      descriptionZh: draft.descriptionZh.trim() || null,
      userIds: draft.userIds,
    }),
  });
}

export function updatePeopleGroup(
  groupId: string,
  draft: PeopleGroupDraft,
) {
  return apiFetch<{ group: PeopleGroup }>(`/api/v1/people-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify({
      nameEn: draft.nameEn.trim(),
      nameZh: draft.nameZh.trim(),
      descriptionEn: draft.descriptionEn.trim() || null,
      descriptionZh: draft.descriptionZh.trim() || null,
      userIds: draft.userIds,
    }),
  });
}

export function setPeopleGroupStatus(
  groupId: string,
  status: PeopleGroup["status"],
) {
  return apiFetch<{ group: PeopleGroup }>(`/api/v1/people-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
