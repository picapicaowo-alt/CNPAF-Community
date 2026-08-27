export type DatasetOption = {
  value: string;
  labelEn: string;
  labelZh: string;
  organizationId?: string | null;
  description?: string | null;
};

export type DatasetBuilderOptions = {
  organizations: DatasetOption[];
  programs: DatasetOption[];
  locations: DatasetOption[];
  forms: DatasetOption[];
  collectors: DatasetOption[];
  services: DatasetOption[];
  populations: DatasetOption[];
  sourceOrigins: DatasetOption[];
  findingTypes: DatasetOption[];
  themes: DatasetOption[];
  reviewStatuses: DatasetOption[];
  researchUseStatuses: DatasetOption[];
  classifications: DatasetOption[];
  approvedRecordCount: number;
};

export type DatasetFilterDraft = {
  dateFrom: string;
  dateTo: string;
  programIds: string[];
  locationIds: string[];
  serviceTypeKeys: string[];
  populationKeys: string[];
  sourceOrigins: string[];
  formVersionIds: string[];
  collectorIds: string[];
  reviewStatuses: string[];
  researchUseStatuses: string[];
  findingTypes: string[];
  themeOrConcernIds: string[];
};

export type DatasetFilters = Partial<{
  dateFrom: string;
  dateTo: string;
  organizationIds: string[];
  programIds: string[];
  locationIds: string[];
  serviceTypeKeys: string[];
  populationKeys: string[];
  sourceOrigins: string[];
  formVersionIds: string[];
  collectorIds: string[];
  reviewStatuses: string[];
  researchUseStatuses: string[];
  findingTypes: string[];
  themeOrConcernIds: string[];
}>;

export type DatasetFieldKey =
  | "structured_answers"
  | "approved_findings"
  | "evidence_excerpts"
  | "collector_notes"
  | "form_version_information"
  | "audit_metadata"
  | "media_attachments";

export type DatasetVersion = {
  id: string;
  versionNumber: number;
  status: string;
  recordCount: number;
  contentHash: string;
  createdAt: string;
  selectionQuery?: { recordIds?: string[]; filters?: DatasetFilters };
  fieldPolicy?: { include: DatasetFieldKey[]; exclude: DatasetFieldKey[] };
};

export type DatasetSummary = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  dataClassification: string;
  updatedAt: string;
  headVersionId?: string | null;
  organizationId: string;
  programId?: string | null;
  headVersion?: DatasetVersion | null;
};

export type DatasetCreateInput = {
  organizationId: string;
  programId: string | null;
  name: string;
  description: string | null;
  dataClassification: string;
  selection: { recordIds: string[] } | { filters: DatasetFilters };
  fieldPolicy: { include: DatasetFieldKey[]; exclude: DatasetFieldKey[] };
};

export type DatasetRecordReference = {
  id: string;
  recordVersionId: string;
  ordinal: number;
  sourceKind: string;
  reviewStatus: string;
  researchUseStatus: string;
  privacyStatus: string;
  site: {
    id: string;
    name: string | null;
    nameEn: string | null;
    nameZh: string | null;
  } | null;
  program: { id: string; nameEn: string | null; nameZh: string | null } | null;
  collector: { id: string; name: string | null };
  occurredAt: string | null;
  attachments: import("@cnpaf/shared").AttachmentSummary[];
};

export type DatasetShare = {
  id: string;
  datasetVersionId: string;
  recipientLabel: string | null;
  accessScope: { userIds?: string[]; organizationIds?: string[] };
  status: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DatasetAccessLog = {
  id: string;
  sharedDatasetId: string;
  action: string;
  actorUserId: string | null;
  createdAt: string;
};

export type DatasetDetail = {
  dataset: DatasetSummary;
  versions: DatasetVersion[];
  selectedVersion: DatasetVersion | null;
  records: DatasetRecordReference[];
  shares: DatasetShare[];
  accessLogs: DatasetAccessLog[];
  mediaSummary: {
    total: number;
    images: number;
    audio: number;
    video: number;
    documents: number;
  };
};
