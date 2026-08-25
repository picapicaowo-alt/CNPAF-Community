import type { FormVisibilityCondition } from "./form-runtime";

export type FormPresetOption = {
  key: string;
  labelEn: string;
  labelZh: string;
};

export type FormPresetField = {
  key: string;
  fieldTypeKey: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string;
  helpTextZh?: string;
  required?: boolean;
  allowMissingReason?: boolean;
  allowCustomEntry?: boolean;
  validation?: Record<string, unknown>;
  visibilityConditions?: FormVisibilityCondition[];
  configuration?: Record<string, unknown>;
  options?: FormPresetOption[];
};

export type FormPreset = {
  key: string;
  templateTypeKey: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
  useCaseEn: string;
  useCaseZh: string;
  estimatedMinutes: number;
  recommended?: boolean;
  configuration?: Record<string, unknown>;
  sections: Array<{
    key: string;
    labelEn: string;
    labelZh: string;
    helpTextEn?: string;
    helpTextZh?: string;
    fields: FormPresetField[];
  }>;
};

const YES_NO_OPTIONS: FormPresetOption[] = [
  { key: "yes", labelEn: "Yes", labelZh: "是" },
  { key: "no", labelEn: "No", labelZh: "否" },
  { key: "unsure", labelEn: "Not sure", labelZh: "不确定" },
];

/**
 * Staff-facing starting points for common CNPAF collection workflows.
 * These are intentionally concise: teams can still add or change every field
 * in the normal versioned form editor after creating the draft.
 */
export const FORM_PRESETS: readonly FormPreset[] = [
  {
    key: "adhc-site-visit",
    templateTypeKey: "activity",
    nameEn: "ADHC site visit observation",
    nameZh: "ADHC 现场访视观察",
    descriptionEn:
      "A guided observation for service quality, participant needs, and follow-up actions.",
    descriptionZh: "用于记录服务质量、参与者需求和后续行动的现场访视表。",
    useCaseEn: "Community and ADHC visits",
    useCaseZh: "社区与成人日间护理中心访视",
    estimatedMinutes: 6,
    recommended: true,
    sections: [
      {
        key: "visit-overview",
        labelEn: "Visit overview",
        labelZh: "访视概况",
        fields: [
          {
            key: "visit-focus",
            fieldTypeKey: "multi_select",
            labelEn: "What did this visit focus on?",
            labelZh: "本次访视重点是什么？",
            required: true,
            allowCustomEntry: true,
            options: [
              { key: "activities", labelEn: "Activities", labelZh: "活动开展" },
              { key: "meals", labelEn: "Meals and nutrition", labelZh: "膳食营养" },
              { key: "care", labelEn: "Care and support", labelZh: "照护支持" },
              { key: "access", labelEn: "Access and environment", labelZh: "可及性与环境" },
            ],
          },
          {
            key: "observed-needs",
            fieldTypeKey: "long_text",
            labelEn: "Needs or barriers observed",
            labelZh: "观察到的需求或障碍",
            helpTextEn: "Describe what happened without entering identifying information.",
            helpTextZh: "请描述现场情况，不要填写姓名等身份信息。",
            required: true,
            allowMissingReason: true,
            validation: { maxLength: 2000 },
          },
          {
            key: "service-quality",
            fieldTypeKey: "rating_scale",
            labelEn: "Overall service quality",
            labelZh: "整体服务质量",
            required: true,
            validation: { min: 1, max: 5 },
            configuration: { minLabelEn: "Needs improvement", minLabelZh: "需要改善", maxLabelEn: "Excellent", maxLabelZh: "非常好" },
          },
        ],
      },
      {
        key: "follow-up",
        labelEn: "Follow-up",
        labelZh: "后续跟进",
        fields: [
          {
            key: "follow-up-needed",
            fieldTypeKey: "single_select",
            labelEn: "Is follow-up needed?",
            labelZh: "是否需要跟进？",
            required: true,
            options: YES_NO_OPTIONS,
          },
          {
            key: "follow-up-action",
            fieldTypeKey: "long_text",
            labelEn: "Recommended next action",
            labelZh: "建议的下一步行动",
            required: true,
            validation: { maxLength: 1500 },
            visibilityConditions: [
              { fieldKey: "follow-up-needed", operator: "equals", value: "yes" },
            ],
          },
          {
            key: "collector-notes",
            fieldTypeKey: "long_text",
            labelEn: "Additional notes",
            labelZh: "补充备注",
            validation: { maxLength: 2000 },
          },
        ],
      },
    ],
  },
  {
    key: "activity-feedback",
    templateTypeKey: "activity",
    nameEn: "Activity participation and feedback",
    nameZh: "活动参与及反馈",
    descriptionEn: "A short post-activity record for reach, experience, and outcomes.",
    descriptionZh: "活动结束后快速记录参与情况、体验和初步成效。",
    useCaseEn: "Workshops, outreach, and community events",
    useCaseZh: "讲座、外展和社区活动",
    estimatedMinutes: 4,
    sections: [
      {
        key: "activity-results",
        labelEn: "Activity results",
        labelZh: "活动结果",
        fields: [
          {
            key: "participant-count",
            fieldTypeKey: "number",
            labelEn: "Approximate participant count",
            labelZh: "大约参与人数",
            required: true,
            validation: { min: 0, max: 10000 },
          },
          {
            key: "satisfaction",
            fieldTypeKey: "rating_scale",
            labelEn: "Overall participant satisfaction",
            labelZh: "参与者整体满意度",
            required: true,
            validation: { min: 1, max: 5 },
          },
          {
            key: "observed-outcomes",
            fieldTypeKey: "multi_select",
            labelEn: "Outcomes observed",
            labelZh: "观察到的成效",
            allowCustomEntry: true,
            options: [
              { key: "knowledge", labelEn: "Increased knowledge", labelZh: "知识提升" },
              { key: "connection", labelEn: "Social connection", labelZh: "社会联结" },
              { key: "resource", labelEn: "Resource connection", labelZh: "资源对接" },
              { key: "confidence", labelEn: "Increased confidence", labelZh: "信心提升" },
            ],
          },
          {
            key: "activity-notes",
            fieldTypeKey: "long_text",
            labelEn: "What should we keep or improve next time?",
            labelZh: "下次应保留或改进什么？",
            validation: { maxLength: 1500 },
          },
        ],
      },
    ],
  },
  {
    key: "service-check-in",
    templateTypeKey: "survey",
    nameEn: "Service experience quick check-in",
    nameZh: "服务体验快速回访",
    descriptionEn: "A plain-language check-in about access, respect, and unresolved concerns.",
    descriptionZh: "用简单问题了解服务可及性、尊重程度和未解决的问题。",
    useCaseEn: "Participant or caregiver follow-up",
    useCaseZh: "服务对象或照护者回访",
    estimatedMinutes: 3,
    sections: [
      {
        key: "experience",
        labelEn: "Service experience",
        labelZh: "服务体验",
        fields: [
          {
            key: "access-rating",
            fieldTypeKey: "rating_scale",
            labelEn: "How easy was it to access the service?",
            labelZh: "获得这项服务是否方便？",
            required: true,
            validation: { min: 1, max: 5 },
          },
          {
            key: "respect-rating",
            fieldTypeKey: "rating_scale",
            labelEn: "Did you feel listened to and respected?",
            labelZh: "您是否感到被倾听和尊重？",
            required: true,
            validation: { min: 1, max: 5 },
          },
          {
            key: "unresolved-concern",
            fieldTypeKey: "single_select",
            labelEn: "Is anything still unresolved?",
            labelZh: "目前还有未解决的问题吗？",
            required: true,
            options: YES_NO_OPTIONS,
          },
          {
            key: "concern-detail",
            fieldTypeKey: "long_text",
            labelEn: "What still needs attention?",
            labelZh: "还有什么需要关注？",
            required: true,
            validation: { maxLength: 1500 },
            visibilityConditions: [
              { fieldKey: "unresolved-concern", operator: "equals", value: "yes" },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "partner-check-in",
    templateTypeKey: "interview",
    nameEn: "Partner organization check-in",
    nameZh: "合作机构回访",
    descriptionEn: "A structured check-in for partner needs, coordination, and next actions.",
    descriptionZh: "结构化记录合作机构需求、协作情况和下一步行动。",
    useCaseEn: "Partner and referral network follow-up",
    useCaseZh: "合作伙伴与转介网络回访",
    estimatedMinutes: 5,
    sections: [
      {
        key: "partnership",
        labelEn: "Partnership check-in",
        labelZh: "合作回访",
        fields: [
          {
            key: "partnership-status",
            fieldTypeKey: "dropdown_choice",
            labelEn: "Current partnership status",
            labelZh: "当前合作状态",
            required: true,
            options: [
              { key: "active", labelEn: "Active", labelZh: "合作顺利" },
              { key: "needs-attention", labelEn: "Needs attention", labelZh: "需要跟进" },
              { key: "paused", labelEn: "Paused", labelZh: "暂缓" },
            ],
          },
          {
            key: "partner-needs",
            fieldTypeKey: "long_text",
            labelEn: "Current needs or requests",
            labelZh: "当前需求或请求",
            allowMissingReason: true,
            validation: { maxLength: 2000 },
          },
          {
            key: "next-action",
            fieldTypeKey: "long_text",
            labelEn: "Agreed next action",
            labelZh: "商定的下一步行动",
            required: true,
            validation: { maxLength: 1500 },
          },
          {
            key: "follow-up-date",
            fieldTypeKey: "date_time",
            labelEn: "Follow-up date",
            labelZh: "下次跟进日期",
          },
        ],
      },
    ],
  },
] as const;

export function getFormPreset(key: string | null | undefined) {
  return FORM_PRESETS.find((preset) => preset.key === key) ?? null;
}
