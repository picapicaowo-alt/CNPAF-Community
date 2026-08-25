import type { MembershipRole, ProgramDraft } from "./types";

export const EMPTY_PROGRAM_DRAFT: ProgramDraft = {
  key: "",
  nameEn: "",
  nameZh: "",
  descriptionEn: "",
  descriptionZh: "",
};

export function programKeyFrom(value: string) {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  if (/^[a-z]/.test(normalized)) return normalized;
  return `program-${normalized || "new"}`.slice(0, 120);
}

export function latestActiveMembershipRoles(items: MembershipRole[]) {
  const latest = new Map<string, MembershipRole>();
  for (const item of items) {
    const current = latest.get(item.key);
    if (item.status === "active" && (!current || item.version > current.version))
      latest.set(item.key, item);
  }
  return [...latest.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
  );
}
