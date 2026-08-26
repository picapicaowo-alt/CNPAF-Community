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
    nameZh: "团体活动",
    nameEn: "Group activity",
    fields: [
      {
        key: "participant_count",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "参与人数",
        nameEn: "Participant count",
      },
      {
        key: "duration_minutes",
        type: "integer",
        required: false,
        min: 0,
        nameZh: "时长（分钟）",
        nameEn: "Duration (minutes)",
      },
      {
        key: "engagement_score",
        type: "scale",
        required: false,
        min: 1,
        max: 5,
        nameZh: "投入度",
        nameEn: "Engagement",
        anchors: [
          { value: 1, zh: "几乎未参与", en: "Very low participation" },
          { value: 3, zh: "中等投入", en: "Moderate" },
          { value: 5, zh: "高度投入", en: "Highly engaged" },
        ],
      },
    ],
  },
  {
    key: "observation",
    version: 1,
    status: "active",
    nameZh: "观察",
    nameEn: "Observation",
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
    nameZh: "现场访谈",
    nameEn: "Interview",
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
    nameZh: "其他",
    nameEn: "Other",
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
