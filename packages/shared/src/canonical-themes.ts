export type CanonicalThemeSeed = {
  key: string;
  version: number;
  status: "active" | "deprecated" | "proposed";
  nameZh: string;
  nameEn: string;
  definition: string;
};

export const CANONICAL_THEMES: CanonicalThemeSeed[] = [
  {
    key: "social_connection",
    version: 1,
    status: "active",
    nameZh: "社会连接 Social connection",
    nameEn: "Social connection 社会连接",
    definition:
      "Opportunities for peer interaction, loneliness, isolation, and companionship. 同伴互动、孤独、隔离与陪伴。",
  },
  {
    key: "engagement",
    version: 1,
    status: "active",
    nameZh: "参与投入 Engagement",
    nameEn: "Engagement 参与投入",
    definition:
      "Activity variety, participation intensity, and interest during programs. 活动多样性、参与强度与兴趣。",
  },
  {
    key: "staffing",
    version: 1,
    status: "active",
    nameZh: "人力配置 Staffing",
    nameEn: "Staffing 人力配置",
    definition: "Staff availability, ratios, and support during activities. 活动中的人力与配比。",
  },
  {
    key: "environment",
    version: 1,
    status: "active",
    nameZh: "环境 Environment",
    nameEn: "Environment 环境",
    definition: "Physical space, noise, accessibility, materials. 空间、噪音、无障碍与物料。",
  },
  {
    key: "safety_wellbeing",
    version: 1,
    status: "active",
    nameZh: "日常福祉 Wellbeing",
    nameEn: "Safety & wellbeing 日常福祉",
    definition:
      "Everyday comfort and wellbeing signals — not a determination of abuse. 日常舒适与福祉信号，不是虐待结论。",
  },
  {
    key: "caregiver_support",
    version: 1,
    status: "active",
    nameZh: "照护者支持 Caregiver support",
    nameEn: "Caregiver support 照护者支持",
    definition: "Family and caregiver load, communication, and support needs.",
  },
  {
    key: "program_fit",
    version: 1,
    status: "active",
    nameZh: "项目适配 Program fit",
    nameEn: "Program fit 项目适配",
    definition: "Whether activities match participant ability, culture, and preference.",
  },
  {
    key: "other",
    version: 1,
    status: "active",
    nameZh: "其他 Other",
    nameEn: "Other 其他",
    definition: "Does not fit seeded themes; requires human mapping.",
  },
];
