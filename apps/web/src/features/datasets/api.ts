import { apiFetch } from "@/lib/api-client";
import type {
  DatasetBuilderOptions,
  DatasetCreateInput,
  DatasetDetail,
  DatasetSummary,
  DatasetVersion,
} from "./types";

export async function fetchDatasetBuilderOptions() {
  const result = await apiFetch<{ options: DatasetBuilderOptions }>(
    "/api/v1/datasets/options",
  );
  return result.options;
}

export async function fetchDatasets() {
  const result = await apiFetch<{ datasets: DatasetSummary[] }>(
    "/api/v1/datasets",
  );
  return result.datasets ?? [];
}

export async function fetchDatasetDetail(datasetId: string, versionId?: string) {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return apiFetch<DatasetDetail>(`/api/v1/datasets/${datasetId}${query}`);
}

export async function createDataset(input: DatasetCreateInput) {
  return apiFetch<{ dataset: DatasetSummary; version: DatasetVersion }>(
    "/api/v1/datasets",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function refreshDataset(datasetId: string) {
  return apiFetch<{ version: DatasetVersion }>(
    `/api/v1/datasets/${datasetId}/refresh`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function downloadDataset(
  dataset: DatasetSummary,
  format: "csv" | "json",
  versionId?: string,
) {
  const response = await fetch(`/api/v1/datasets/${dataset.id}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, versionId }),
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : (payload.error?.message ?? "Download failed"),
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${dataset.name}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}


export async function shareDataset(input: {
  datasetId: string;
  datasetVersionId: string;
  recipientLabel: string | null;
  expiresAt: string | null;
}) {
  return apiFetch<{ share: { id: string }; token: string }>(
    `/api/v1/datasets/${input.datasetId}/share`,
    {
      method: "POST",
      body: JSON.stringify({
        datasetVersionId: input.datasetVersionId,
        recipientLabel: input.recipientLabel,
        expiresAt: input.expiresAt,
        accessScope: {},
      }),
    },
  );
}

export async function revokeDatasetShare(shareId: string) {
  return apiFetch<{ share: { id: string; status: string } }>(
    `/api/v1/dataset-shares/${shareId}/revoke`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function archiveDataset(datasetId: string, reason: string) {
  return apiFetch<{ dataset: DatasetSummary; revokedShareCount: number }>(
    `/api/v1/datasets/${datasetId}/archive`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
