export const CONFIGURATION_REGISTRIES = [
  {
    key: "site_type",
    labelEn: "Location types",
    labelZh: "地点类型",
    descriptionEn: "Types available when staff create canonical locations.",
    descriptionZh: "创建标准地点时可选择的地点分类。",
  },
  {
    key: "task_type",
    labelEn: "Task types",
    labelZh: "任务类型",
    descriptionEn: "Operational categories available when tasks are created.",
    descriptionZh: "创建任务时可选择的运营分类。",
  },
  {
    key: "priority_level",
    labelEn: "Priority levels",
    labelZh: "优先级",
    descriptionEn:
      "Optional priority choices used across task creation and editing.",
    descriptionZh:
      "任务创建与编辑中共用的可选优先级；停用后不再出现在新选择中，历史任务仍保留原值。",
  },
  {
    key: "template_type",
    labelEn: "Form types",
    labelZh: "表单类型",
    descriptionEn: "Categories used to organize collection forms.",
    descriptionZh: "用于组织采集表单的分类。",
  },
  {
    key: "source_kind",
    labelEn: "Record sources",
    labelZh: "记录来源",
    descriptionEn: "Source categories and their collection policy metadata.",
    descriptionZh: "记录来源分类及对应采集策略。",
  },
  {
    key: "missing_reason",
    labelEn: "Missing reasons",
    labelZh: "未记录原因",
    descriptionEn: "Approved explanations for values that could not be recorded.",
    descriptionZh: "字段无法记录时允许选择的标准原因。",
  },
  {
    key: "program_membership_role",
    labelEn: "Program member roles",
    labelZh: "项目成员类型",
    descriptionEn: "Roles assigned to people inside a program.",
    descriptionZh: "人员加入项目后可分配的项目内角色。",
  },
] as const;

export type ConfigurationRegistryKey =
  (typeof CONFIGURATION_REGISTRIES)[number]["key"];

export type RegistryDefinition = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  status: string;
};

export type RegistryItem = {
  id: string;
  registryId: string;
  key: string;
  version: number;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  status: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  organizationId?: string | null;
};

export type RegistryBundle = {
  registry: RegistryDefinition;
  items: RegistryItem[];
};

export type RegistryItemDraft = {
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn: string;
  helpTextZh: string;
  sortOrder: number;
};
