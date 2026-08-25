import type { FormVersionComparison } from "@cnpaf/shared";
import { apiFetch } from "@/lib/api-client";

export async function compareFormVersions(
  templateId: string,
  fromVersionId: string,
  toVersionId: string,
) {
  const query = new URLSearchParams({ fromVersionId, toVersionId });
  return apiFetch<{ comparison: FormVersionComparison }>(
    `/api/v1/templates/${templateId}/versions/compare?${query}`,
  );
}
