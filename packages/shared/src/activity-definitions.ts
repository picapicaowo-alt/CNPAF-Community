export type ActivityFieldType = "integer" | "number" | "scale";

export type ActivityFieldDef = {
  key: string;
  type: ActivityFieldType;
  required: boolean;
  min?: number;
  max?: number;
  nameZh: string;
  nameEn: string;
  anchors?: { value: number; zh: string; en: string }[];
};

export type ActivityDefinitionSeed = {
  key: string;
  version: number;
  status: "active" | "deprecated";
  nameZh: string;
  nameEn: string;
  fields: ActivityFieldDef[];
};

export const ACTIVITY_DEFINITIONS: ActivityDefinitionSeed[] = [
  {
    key: "group_activity",
    version: 1,
    status: "active",
    nameZh: "团体活动 Group activity",
    nameEn: "Group activity 团体活动",
    fields: [
      {
        key: "participant_count",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "参与人数 Participant count",
        nameEn: "Participant count 参与人数",
      },
      {
        key: "duration_minutes",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "时长（分钟） Duration minutes",
        nameEn: "Duration (minutes) 时长",
      },
      {
        key: "engagement_score",
        type: "scale",
        required: false,
        min: 1,
        max: 5,
        nameZh: "投入度 Engagement",
        nameEn: "Engagement 投入度",
        anchors: [
          { value: 1, zh: "几乎未参与 very low participation", en: "Very low participation 几乎未参与" },
          { value: 3, zh: "中等投入 moderate", en: "Moderate 中等投入" },
          { value: 5, zh: "高度投入 highly engaged", en: "Highly engaged 高度投入" },
        ],
      },
    ],
  },
  {
    key: "observation",
    version: 1,
    status: "active",
    nameZh: "观察 Observation",
    nameEn: "Observation 观察",
    fields: [
      {
        key: "duration_minutes",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "观察时长（分钟）",
        nameEn: "Observation duration (minutes)",
      },
      {
        key: "group_size_estimate",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "群体规模估计",
        nameEn: "Estimated group size",
      },
    ],
  },
  {
    key: "interview",
    version: 1,
    status: "active",
    nameZh: "现场访谈 Interview",
    nameEn: "Interview 现场访谈",
    fields: [
      {
        key: "duration_minutes",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "时长（分钟）",
        nameEn: "Duration (minutes)",
      },
    ],
  },
  {
    key: "other",
    version: 1,
    status: "active",
    nameZh: "其他 Other",
    nameEn: "Other 其他",
    fields: [
      {
        key: "duration_minutes",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "时长（分钟）",
        nameEn: "Duration (minutes)",
      },
    ],
  },
];
