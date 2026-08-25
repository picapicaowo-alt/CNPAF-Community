import type { FormVersionComparison } from "@cnpaf/shared";

export type FormVersionSummary = {
  id: string;
  version: number;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  configuration: Record<string, unknown>;
  status: string;
  publishedAt?: string | null;
  usageCount?: number;
  sectionCount?: number;
  fieldCount?: number;
};

export type ReleaseNotes = { en: string; zh: string };

export type { FormVersionComparison };

export function releaseNotesFromVersion(
  version?: FormVersionSummary | null,
): ReleaseNotes {
  const candidate = version?.configuration.releaseNotes;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return { en: "", zh: "" };
  const notes = candidate as Record<string, unknown>;
  return {
    en: typeof notes.en === "string" ? notes.en : "",
    zh: typeof notes.zh === "string" ? notes.zh : "",
  };
}
