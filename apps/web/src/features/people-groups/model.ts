export function peopleGroupKeyFrom(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return normalized || `group-${Date.now().toString(36)}`;
}

export function primaryDepartment(
  affiliations: Array<{
    departmentName?: string | null;
    institutionName: string;
    status: string;
  }>,
) {
  const affiliation = affiliations.find((item) => item.status === "active");
  return affiliation?.departmentName || affiliation?.institutionName || "";
}
