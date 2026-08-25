import { emptyDatasetFilterDraft } from "@/features/datasets/model";
import type { DatasetFilterDraft } from "@/features/datasets/types";

const canonicalReviewStatuses = new Set([
  "pending",
  "approved",
  "needs_completion",
]);

/**
 * Preserves Insights -> Records links while translating repeatable dimensions
 * into the same canonical filters used by Records, Datasets, and reports.
 * Privacy/draft drill-downs stay local because they intentionally freeze IDs.
 */
export function recordFilterStateFromParams({
  source,
  stage,
  status,
}: {
  source?: string | null;
  stage?: string | null;
  status?: string | null;
}): { filters: DatasetFilterDraft; localStatus: string } {
  const filters = emptyDatasetFilterDraft();
  const normalizedStatus = status && status !== "all" ? status : null;
  if (normalizedStatus && canonicalReviewStatuses.has(normalizedStatus)) {
    filters.reviewStatuses = [normalizedStatus];
  } else if (stage === "submitted") {
    filters.reviewStatuses = ["pending", "approved", "needs_completion"];
  }
  if (source && source !== "all") filters.serviceTypeKeys = [source];
  return {
    filters,
    localStatus:
      normalizedStatus && !canonicalReviewStatuses.has(normalizedStatus)
        ? normalizedStatus
        : "all",
  };
}
