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
    nameZh: "社会连接",
    nameEn: "Social connection",
    definition:
      "Opportunities for peer interaction, loneliness, isolation, and companionship.",
  },
  {
    key: "engagement",
    version: 1,
    status: "active",
    nameZh: "参与投入",
    nameEn: "Engagement",
    definition:
      "Activity variety, participation intensity, and interest during programs.",
  },
  {
    key: "staffing",
    version: 1,
    status: "active",
    nameZh: "人力配置",
    nameEn: "Staffing",
    definition: "Staff availability, ratios, and support during activities.",
  },
  {
    key: "environment",
    version: 1,
    status: "active",
    nameZh: "环境",
    nameEn: "Environment",
    definition: "Physical space, noise, accessibility, and materials.",
  },
  {
    key: "safety_wellbeing",
    version: 1,
    status: "active",
    nameZh: "日常福祉",
    nameEn: "Safety and wellbeing",
    definition:
      "Everyday comfort and wellbeing signals; not a determination of abuse.",
  },
  {
    key: "caregiver_support",
    version: 1,
    status: "active",
    nameZh: "照护者支持",
    nameEn: "Caregiver support",
    definition: "Family and caregiver load, communication, and support needs.",
  },
  {
    key: "program_fit",
    version: 1,
    status: "active",
    nameZh: "项目适配",
    nameEn: "Program fit",
    definition: "Whether activities match participant ability, culture, and preference.",
  },
  {
    key: "other",
    version: 1,
    status: "active",
    nameZh: "其他",
    nameEn: "Other",
    definition: "Does not fit seeded themes; requires human mapping.",
  },
];
