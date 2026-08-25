import { apiFetch } from "@/lib/api-client";
import type {
  QuickCapturePackage,
  QuickFormSummary,
  SiteChoice,
} from "./types";

export function listQuickForms() {
  return apiFetch<{ forms: QuickFormSummary[] }>("/api/v1/quick-capture/forms");
}

export function loadQuickFormPackage(versionId: string) {
  return apiFetch<QuickCapturePackage>(
    `/api/v1/quick-capture/forms/${versionId}/package`,
  );
}

export function searchCaptureSites(query: string) {
  return apiFetch<{ sites: SiteChoice[] }>(
    `/api/v1/sites?q=${encodeURIComponent(query)}`,
  );
}

export function createCaptureSite(body: {
  name: string;
  siteType: string;
  organizationId?: string | null;
}) {
  return apiFetch<{ site?: SiteChoice; suggestions?: SiteChoice[] }>(
    "/api/v1/sites",
    { method: "POST", body: JSON.stringify(body) },
  );
}
