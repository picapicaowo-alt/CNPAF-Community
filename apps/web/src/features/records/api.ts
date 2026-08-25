import { apiFetch } from "@/lib/api-client";
import type { DatasetBuilderOptions } from "@/features/datasets/types";

export async function fetchRecordFilterOptions() {
  const result = await apiFetch<{ options: DatasetBuilderOptions }>(
    "/api/v1/records/options",
  );
  return result.options;
}

export async function downloadRecord(recordId: string) {
  const response = await fetch(`/api/v1/records/${recordId}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "json" }),
  });
  if (!response.ok) throw new Error("Download failed");

  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `record-${recordId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
