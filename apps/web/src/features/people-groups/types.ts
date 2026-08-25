export type PeopleGroup = {
  id: string;
  organizationId: string;
  key: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  status: "active" | "archived";
  memberIds: string[];
};

export type GroupablePerson = {
  id: string;
  name: string;
  email: string;
  status: string;
  affiliations: Array<{
    departmentName?: string | null;
    institutionName: string;
    status: string;
  }>;
};

export type PeopleGroupDraft = {
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
  userIds: string[];
};
