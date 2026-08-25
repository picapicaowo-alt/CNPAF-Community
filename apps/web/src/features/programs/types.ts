export type Program = {
  id: string;
  organizationId: string;
  key: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  status: "draft" | "active" | "completed" | "archived";
  updatedAt: string;
};

export type ProgramMembership = {
  id: string;
  userId: string;
  name: string;
  email: string;
  membershipRoleKey: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type ProgramBundle = {
  program: Program;
  memberships: ProgramMembership[];
};

export type ProgramDraft = {
  key: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
};

export type ProgramDetailsDraft = Pick<
  ProgramDraft,
  "nameEn" | "nameZh" | "descriptionEn" | "descriptionZh"
>;

export type PersonChoice = {
  id: string;
  name: string;
  email: string;
  status: string;
  affiliations: Array<{
    institutionName: string;
    departmentName?: string | null;
    status: string;
  }>;
  groups: Array<{
    id: string;
    nameEn: string;
    nameZh: string;
    status: string;
  }>;
};

export type MembershipRole = {
  id: string;
  key: string;
  version: number;
  labelEn: string;
  labelZh: string;
  status: string;
  sortOrder: number;
};
