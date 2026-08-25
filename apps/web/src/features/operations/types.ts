export type OpsQueueRecord = {
  id: string;
  sourceKind: string;
  privacyStatus: string;
  aiStatus: string;
  reviewStatus: string;
  updatedAt: string;
};

export type InviteSummary = {
  email: string;
  role: string;
  acceptedAt: string | null;
};

export type SafetyFlagSummary = {
  id: string;
  statement: string;
  status: string;
  createdAt: string;
};

export type OpsSite = {
  id: string;
  name: string;
  siteType: string;
  canonicalStatus: string;
  region: string | null;
};

export type JobSummary = {
  id: string;
  kind: string;
  status: string;
  lastError: string | null;
  attempts: number;
};

export type ReviewFinding = {
  id: string;
  kind: string;
  statement: string;
  origin?: string | null;
  evidence: Array<{ text: string; start: number; end: number }>;
  suggestedCanonicalThemeId?: string | null;
};

export type ReviewRecord = {
  record: {
    sourceKind: string;
    privacyStatus: string;
    aiStatus: string;
  };
  versions: Array<{ qualitative?: string }>;
  findings: ReviewFinding[];
};

export type ReviewFindingDecision = {
  findingId: string;
  decision: string;
  editedStatement?: string;
};
