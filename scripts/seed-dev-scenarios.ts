import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "@cnpaf/db";
import {
  annotations,
  attachments,
  auditEvents,
  canonicalThemes,
  concerns,
  configRegistries,
  configRegistryItems,
  datasetRecords,
  datasets,
  datasetVersions,
  lookups,
  privacyFlags,
  programMemberships,
  programs,
  recordFieldAnswers,
  records,
  recordStructuredSelections,
  recordVersions,
  reportSections,
  reportTemplateVersions,
  reports,
  reportVersions,
  reviewDecisions,
  safetyFlags,
  sites,
  taskAssignments,
  tasks,
  templateFieldOptions,
  templateFields,
  templateSections,
  templates,
  templateVersions,
  users,
} from "@cnpaf/db/schema";
import { CANONICAL_THEMES, LOOKUPS } from "@cnpaf/shared";

config({ path: ".env" });
config({ path: "apps/web/.env.local" });

type Target = "local" | "dev";
type ScenarioStatus = "approved" | "draft" | "needs_completion" | "pending" | "privacy_pending" | "safety_pending";
type ActivityType = "creative" | "exercise" | "music" | "discussion" | "quiet";
type Alternative = "activity_design" | "fatigue" | "hearing_access" | "social_connection" | "grief" | "cognitive_change";
type Language = "mandarin" | "cantonese" | "english" | "spanish" | "vietnamese";
type ThemeKey = "social_connection" | "engagement" | "caregiver_support" | "program_fit" | "environment" | "safety_wellbeing";

type Scenario = {
  key: string;
  collector: string;
  status: ScenarioStatus;
  days: number;
  sourceKind?: "field_visit" | "professor_interview" | "literature" | "other";
  attendance: number;
  activityType: ActivityType;
  sessionMinutes: number;
  attentionMinute: number | null;
  earlyDepartures: number;
  engagement: number;
  lonelinessMentions: number;
  languages: Language[];
  observation: string;
  alternatives: Alternative[];
  nextAction: string;
  themeKey: ThemeKey;
  concern: string;
  origin?: "field_observation" | "participant_feedback" | "expert_interview" | "literature";
  attachments?: string[];
};

type Workflow = {
  key: string;
  location: { name: string; city: string; siteType: "adhc" | "nursing_home" };
  title: string;
  records: Scenario[];
};

const TARGET = process.env.CNPAF_DATA_TARGET?.trim() as Target | undefined;
if (!TARGET || !["local", "dev"].includes(TARGET)) throw new Error("CNPAF_DATA_TARGET must be local or dev; production is never accepted");
if (process.env.CNPAF_CONFIRM_MOCK_RESET?.trim() !== "RESET_MOCK_DATA") throw new Error("CNPAF_CONFIRM_MOCK_RESET=RESET_MOCK_DATA is required");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const databaseIdentity = new URL(databaseUrl);
if (TARGET === "local" && !new Set(["127.0.0.1", "localhost", "::1"]).has(databaseIdentity.hostname)) throw new Error("Local reset requires a localhost database host");
if (/prod/i.test(databaseIdentity.pathname)) throw new Error("Refusing to reset a database whose name contains prod");

const SCENARIO_KEY = "cnpaf-community-field-intelligence-2026-v2";
const FIXTURE_DIR = path.resolve("scripts/fixtures/field-evidence");
const db = createDb();
const requiredAccounts = [
  "admin@cnpaf.local", "ops@cnpaf.local", "usc.gerontology.alex@cnpaf.local",
  "usc.gerontology.maya@cnpaf.local", "usc.socialwork.jordan@cnpaf.local",
  "usc.publicpolicy.priya@cnpaf.local", "usc.engineering.ethan@cnpaf.local",
  "usc.medicine.sofia@cnpaf.local", "usc.dornsife.noah@cnpaf.local",
] as const;

const optionDefinitions = {
  "activity-type": [
    ["creative", "Creative activity", "创作活动"], ["exercise", "Movement or exercise", "运动或锻炼"],
    ["music", "Music activity", "音乐活动"], ["discussion", "Discussion or storytelling", "讨论或讲故事"],
    ["quiet", "Quiet individual activity", "安静的个人活动"],
  ],
  "language-access": [
    ["mandarin", "Mandarin", "普通话"], ["cantonese", "Cantonese", "粤语"],
    ["english", "English", "英语"], ["spanish", "Spanish", "西班牙语"], ["vietnamese", "Vietnamese", "越南语"],
  ],
  "alternative-explanations": [
    ["activity_design", "Activity design", "活动设计"], ["fatigue", "Fatigue or time of day", "疲劳或时段"],
    ["hearing_access", "Hearing or sensory access", "听力或感官可及性"], ["social_connection", "Social connection need", "社会连接需求"],
    ["grief", "Loss or grief", "失落或哀伤"], ["cognitive_change", "Possible cognitive change", "可能的认知变化"],
  ],
} as const;

const fieldDefinitions = [
  { key: "attendance", fieldTypeKey: "number", labelEn: "Participants present", labelZh: "现场参与人数", required: true },
  { key: "activity-type", fieldTypeKey: "single_select", labelEn: "Activity type", labelZh: "活动类型", required: true },
  { key: "session-minutes", fieldTypeKey: "number", labelEn: "Session duration in minutes", labelZh: "活动持续时间（分钟）", required: true },
  { key: "attention-change-minute", fieldTypeKey: "number", labelEn: "Minute when attention changed", labelZh: "注意力开始变化的分钟", required: false },
  { key: "early-departures", fieldTypeKey: "number", labelEn: "Early departures", labelZh: "提前离场人数", required: true },
  { key: "engagement-rating", fieldTypeKey: "rating_scale", labelEn: "Observed engagement", labelZh: "观察到的参与投入度", required: true },
  { key: "loneliness-mentions", fieldTypeKey: "number", labelEn: "Loneliness-related mentions", labelZh: "孤独相关表达次数", required: true },
  { key: "language-access", fieldTypeKey: "multi_select", labelEn: "Languages needed", labelZh: "需要提供的语言", required: true },
  { key: "repeated-pattern", fieldTypeKey: "boolean", labelEn: "Repeated pattern", labelZh: "是否重复出现", required: true },
  { key: "observation", fieldTypeKey: "long_text", labelEn: "De-identified field observation", labelZh: "去标识化一线观察", required: true },
  { key: "alternative-explanations", fieldTypeKey: "multi_select", labelEn: "Alternative explanations to test", labelZh: "需要检验的替代解释", required: true },
  { key: "next-action", fieldTypeKey: "long_text", labelEn: "Next verification step", labelZh: "下一步验证方法", required: true },
] as const;

function makeScenario(input: Omit<Scenario, "collector"> & { collector: number }): Scenario {
  return { ...input, collector: requiredAccounts[input.collector]! };
}

const workflows: Workflow[] = [
  {
    key: "harbor-engagement", location: { name: "Harbor Community Day Center", city: "Monterey Park", siteType: "adhc" },
    title: "Two-week activity engagement and attention follow-up", records: [
      makeScenario({ key: "harbor-1", collector: 2, status: "approved", days: 19, attendance: 24, activityType: "quiet", sessionMinutes: 45, attentionMinute: 21, earlyDepartures: 3, engagement: 2, lonelinessMentions: 1, languages: ["mandarin", "english"], observation: "在重复的纸笔练习开始约二十分钟后，多位参与者开始四处张望，其中三人提前离场；改为熟悉歌曲后参与度回升。", alternatives: ["activity_design", "fatigue", "hearing_access"], nextAction: "连续两周比较纸笔、音乐和小组讲述活动中的参与持续时间，并记录更换形式后是否改善。", themeKey: "engagement", concern: "Repeated activities show reduced sustained attention and engagement.", attachments: ["field-observation-follow-up.docx", "activity-session-observation.png"] }),
      makeScenario({ key: "harbor-2", collector: 3, status: "approved", days: 15, attendance: 21, activityType: "music", sessionMinutes: 40, attentionMinute: null, earlyDepartures: 0, engagement: 5, lonelinessMentions: 2, languages: ["mandarin", "cantonese"], observation: "熟悉歌曲活动中，大多数参与者持续投入；两位老人主动谈到家人近期较少探访，并在活动结束后继续寻找工作人员交谈。", alternatives: ["social_connection", "grief"], nextAction: "用中性问题了解希望获得的陪伴方式，并观察类似表达是否在不同日期重复出现。", themeKey: "social_connection", concern: "Repeated expressions may reflect loneliness and a need for social connection.", origin: "participant_feedback", attachments: ["activity-engagement-summary.pdf"] }),
      makeScenario({ key: "harbor-3", collector: 4, status: "approved", days: 11, attendance: 23, activityType: "discussion", sessionMinutes: 35, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 1, languages: ["mandarin", "english"], observation: "小组讲故事时参与者轮流回应，较少出现提前离场；一名参与者多次询问下周是否仍有同伴活动。", alternatives: ["social_connection", "activity_design"], nextAction: "记录同一参与者在个人活动与小组活动中的交流发起频率。", themeKey: "social_connection", concern: "Small-group interaction may be meeting an ongoing social-connection need.", attachments: ["participation-observations.csv"] }),
      makeScenario({ key: "harbor-4", collector: 5, status: "pending", days: 4, attendance: 20, activityType: "quiet", sessionMinutes: 45, attentionMinute: 18, earlyDepartures: 2, engagement: 2, lonelinessMentions: 0, languages: ["mandarin"], observation: "下午纸笔活动再次出现注意力下降，但本次未记录室内噪音和听力辅助设备使用情况。", alternatives: ["activity_design", "hearing_access", "fatigue"], nextAction: "审核后补充房间噪音、座位位置和辅助设备信息。", themeKey: "engagement", concern: "The repeated attention change needs environmental context before interpretation." }),
    ],
  },
  {
    key: "golden-years-loss", location: { name: "Golden Years Adult Day Health Care", city: "San Gabriel", siteType: "adhc" },
    title: "Social connection, recent loss, and preferred support check-in", records: [
      makeScenario({ key: "golden-1", collector: 6, status: "approved", days: 18, sourceKind: "professor_interview", attendance: 18, activityType: "discussion", sessionMinutes: 30, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 3, languages: ["cantonese", "english"], observation: "三次对话中有人反复提到配偶去世后周末很安静，并主动询问是否有固定的小组聊天。", alternatives: ["grief", "social_connection"], nextAction: "询问希望参加的同伴支持形式，避免将正常哀伤直接解释为心理疾病。", themeKey: "social_connection", concern: "Recent loss and loneliness-related expressions are occurring together.", origin: "expert_interview" }),
      makeScenario({ key: "golden-2", collector: 7, status: "approved", days: 13, attendance: 16, activityType: "creative", sessionMinutes: 50, attentionMinute: 34, earlyDepartures: 1, engagement: 3, lonelinessMentions: 2, languages: ["mandarin", "english"], observation: "纪念手工活动引发多次关于已故亲友的回忆；大部分参与者愿意分享，但一人中途离开安静休息。", alternatives: ["grief", "fatigue", "activity_design"], nextAction: "下次记录离场前的具体情境，并提供可选择的安静空间与退出方式。", themeKey: "safety_wellbeing", concern: "Loss-related material may affect emotional comfort for some participants." }),
      makeScenario({ key: "golden-3", collector: 8, status: "approved", days: 9, attendance: 17, activityType: "music", sessionMinutes: 35, attentionMinute: null, earlyDepartures: 0, engagement: 5, lonelinessMentions: 1, languages: ["mandarin", "cantonese"], observation: "怀旧音乐后，一名近期丧亲的参与者主动与同伴交流并留下参加茶歇。", alternatives: ["grief", "social_connection"], nextAction: "继续观察这种改善是否在后续活动中重复，并记录参与者自己偏好的支持方式。", themeKey: "social_connection", concern: "Familiar music may support social connection after a loss, pending repeated observation." }),
      makeScenario({ key: "golden-4", collector: 2, status: "needs_completion", days: 3, attendance: 15, activityType: "discussion", sessionMinutes: 30, attentionMinute: null, earlyDepartures: 0, engagement: 3, lonelinessMentions: 2, languages: ["mandarin"], observation: "记录写到多人谈及孤独，但没有注明观察日期、活动情境或是否为同一批参与者。", alternatives: ["social_connection", "grief"], nextAction: "补充日期、情境、人数以及表达是否由同一参与者重复提出。", themeKey: "social_connection", concern: "Evidence is insufficient to establish frequency or persistence." }),
    ],
  },
  {
    key: "evergreen-caregiver", location: { name: "Evergreen Adult Day Health Care", city: "Alhambra", siteType: "adhc" },
    title: "Caregiver load, respite access, and communication follow-up", records: [
      makeScenario({ key: "evergreen-1", collector: 3, status: "approved", days: 17, attendance: 26, activityType: "discussion", sessionMinutes: 40, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 0, languages: ["mandarin", "spanish", "english"], observation: "四位照护者询问周末喘息服务，其中两人表示临时取消工作才能处理接送。", alternatives: ["social_connection", "fatigue"], nextAction: "记录需求发生的时间、照护安排和最可行的周末时段，不收集不必要的个人身份信息。", themeKey: "caregiver_support", concern: "Caregiver load and respite access need priority follow-up.", origin: "participant_feedback" }),
      makeScenario({ key: "evergreen-2", collector: 4, status: "approved", days: 12, attendance: 28, activityType: "exercise", sessionMinutes: 30, attentionMinute: null, earlyDepartures: 0, engagement: 5, lonelinessMentions: 0, languages: ["mandarin", "english"], observation: "增加十五分钟弹性接送后，照护者迟到次数下降，活动开始前的匆忙情况减少。", alternatives: ["activity_design", "fatigue"], nextAction: "继续比较四周接送准时率和照护者反馈。", themeKey: "caregiver_support", concern: "A scheduling adjustment may reduce caregiver time pressure." }),
      makeScenario({ key: "evergreen-3", collector: 5, status: "pending", days: 6, attendance: 22, activityType: "discussion", sessionMinutes: 45, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 1, languages: ["mandarin", "spanish"], observation: "照护者教育小组报名增加，但目前只有报名数，没有到场率和取消原因。", alternatives: ["social_connection", "activity_design"], nextAction: "审核后关联报名、到场和取消数据，再判断服务是否真正可及。", themeKey: "caregiver_support", concern: "Demand appears higher, but actual use remains uncertain." }),
      makeScenario({ key: "evergreen-4", collector: 6, status: "draft", days: 1, attendance: 19, activityType: "quiet", sessionMinutes: 30, attentionMinute: 16, earlyDepartures: 1, engagement: 2, lonelinessMentions: 0, languages: ["english"], observation: "草稿：一名照护者询问晚间电话支持，尚未完成服务时间和频率核实。", alternatives: ["fatigue", "social_connection"], nextAction: "完成访谈后再提交，不把单次询问写成普遍需求。", themeKey: "caregiver_support", concern: "One request does not yet establish a recurring evening-support need." }),
    ],
  },
  {
    key: "harmony-access", location: { name: "Harmony Community Care Center", city: "Rosemead", siteType: "adhc" },
    title: "Language access and transportation reliability review", records: [
      makeScenario({ key: "harmony-1", collector: 7, status: "approved", days: 16, sourceKind: "other", attendance: 25, activityType: "exercise", sessionMinutes: 35, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 0, languages: ["mandarin", "vietnamese", "english"], observation: "更新越南语和普通话时刻表后，前台重复解释接送时间的次数减少。", alternatives: ["hearing_access", "activity_design"], nextAction: "继续记录不同语言版本的领取和使用情况。", themeKey: "program_fit", concern: "Multilingual information improved service understanding and transportation coordination." }),
      makeScenario({ key: "harmony-2", collector: 8, status: "approved", days: 10, attendance: 23, activityType: "creative", sessionMinutes: 45, attentionMinute: 31, earlyDepartures: 1, engagement: 3, lonelinessMentions: 0, languages: ["mandarin", "vietnamese"], observation: "一条返程路线连续两次晚到超过十五分钟，等待期间部分参与者表现焦躁并反复询问时间。", alternatives: ["fatigue", "social_connection", "activity_design"], nextAction: "关联两周车辆日志，区分偶发交通与持续调度问题。", themeKey: "program_fit", concern: "Transportation uncertainty may affect emotional comfort while waiting.", attachments: ["attachment-readme.txt"] }),
      makeScenario({ key: "harmony-3", collector: 2, status: "pending", days: 5, attendance: 21, activityType: "music", sessionMinutes: 40, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 0, languages: ["cantonese", "english"], observation: "工作人员报告新短信提醒有帮助，但尚未核对实际发送成功率。", alternatives: ["activity_design"], nextAction: "审核后查看去标识化发送日志和家属反馈。", themeKey: "program_fit", concern: "Reminder effectiveness needs delivery-success evidence." }),
      makeScenario({ key: "harmony-4", collector: 3, status: "needs_completion", days: 2, attendance: 20, activityType: "discussion", sessionMinutes: 35, attentionMinute: null, earlyDepartures: 0, engagement: 3, lonelinessMentions: 0, languages: ["mandarin", "vietnamese"], observation: "记录把家庭接送和中心车辆合并统计，无法判断延误来自哪一种安排。", alternatives: ["activity_design", "fatigue"], nextAction: "分别补充家庭接送与中心路线的数量和延误时间。", themeKey: "program_fit", concern: "Transportation-source mapping is insufficient for a usable conclusion." }),
    ],
  },
  {
    key: "pacific-mobility", location: { name: "Pacific Garden Senior Living", city: "Arcadia", siteType: "nursing_home" },
    title: "Mobility access, hearing support, and participation observation", records: [
      makeScenario({ key: "pacific-1", collector: 4, status: "approved", days: 14, sourceKind: "literature", attendance: 14, activityType: "exercise", sessionMinutes: 30, attentionMinute: 22, earlyDepartures: 1, engagement: 3, lonelinessMentions: 0, languages: ["mandarin", "english"], observation: "椅上运动时，扩音设备断续导致两名参与者多次停下观察他人动作；更换设备后重新加入。", alternatives: ["hearing_access", "activity_design"], nextAction: "记录设备使用、座位位置和更换设备后的参与变化。", themeKey: "environment", concern: "Hearing access may be affecting activity participation.", origin: "literature" }),
      makeScenario({ key: "pacific-2", collector: 5, status: "approved", days: 8, attendance: 13, activityType: "creative", sessionMinutes: 50, attentionMinute: 38, earlyDepartures: 1, engagement: 4, lonelinessMentions: 0, languages: ["mandarin"], observation: "调整桌面高度后，轮椅使用者能够更独立地完成绘画步骤，并停留到活动结束。", alternatives: ["activity_design"], nextAction: "在其他桌面活动中重复测试相同调整。", themeKey: "environment", concern: "A physical-environment adjustment may improve independent participation." }),
      makeScenario({ key: "pacific-3", collector: 6, status: "pending", days: 4, attendance: 12, activityType: "discussion", sessionMinutes: 35, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 1, languages: ["mandarin", "english"], observation: "一名参与者表示听不清小组讨论并较少发言，工作人员临时调整座位后回应增加。", alternatives: ["hearing_access", "social_connection"], nextAction: "审核后确认是否在不同小组中重复，并记录辅助措施。", themeKey: "environment", concern: "Hearing access and social participation may have a modifiable relationship." }),
      makeScenario({ key: "pacific-4", collector: 7, status: "privacy_pending", days: 1, attendance: 11, activityType: "quiet", sessionMinutes: 30, attentionMinute: 15, earlyDepartures: 1, engagement: 2, lonelinessMentions: 1, languages: ["english"], observation: "原始记录意外包含了家庭成员的完整姓名；该文本只用于验证隐私队列，不应进入分析。", alternatives: ["social_connection"], nextAction: "先完成人工脱敏，再决定是否允许后续分析。", themeKey: "safety_wellbeing", concern: "The privacy issue must be resolved before this record is used." }),
    ],
  },
  {
    key: "willow-wellbeing", location: { name: "Willow Terrace Nursing Center", city: "Pasadena", siteType: "nursing_home" },
    title: "Daily wellbeing, nutrition, and safeguarding observation", records: [
      makeScenario({ key: "willow-1", collector: 8, status: "approved", days: 13, attendance: 15, activityType: "discussion", sessionMinutes: 30, attentionMinute: null, earlyDepartures: 0, engagement: 4, lonelinessMentions: 2, languages: ["mandarin", "english"], observation: "午餐后两位参与者主动寻找工作人员聊天，并提到周末很少有人探访。", alternatives: ["social_connection", "grief"], nextAction: "在不同班次用相同中性问题了解希望的陪伴方式。", themeKey: "social_connection", concern: "Weekend loneliness-related expressions merit continued attention.", origin: "participant_feedback" }),
      makeScenario({ key: "willow-2", collector: 2, status: "approved", days: 7, attendance: 16, activityType: "music", sessionMinutes: 35, attentionMinute: null, earlyDepartures: 0, engagement: 5, lonelinessMentions: 0, languages: ["mandarin", "cantonese"], observation: "固定同伴座位和点歌环节后，原本较少发言的参与者主动提出歌曲并与邻座交流。", alternatives: ["social_connection", "activity_design"], nextAction: "继续记录是否在其他社交活动中出现同样改善。", themeKey: "social_connection", concern: "Stable peer interaction may strengthen social connection." }),
      makeScenario({ key: "willow-3", collector: 3, status: "safety_pending", days: 3, attendance: 12, activityType: "quiet", sessionMinutes: 25, attentionMinute: 12, earlyDepartures: 2, engagement: 1, lonelinessMentions: 0, languages: ["english"], observation: "一名参与者连续两餐明显少吃并表示吞咽不适，工作人员已按流程通知护士；系统仅标记紧急人工复核，不下诊断。", alternatives: ["fatigue"], nextAction: "立即由临床和照护团队按既有流程评估，并记录后续处置。", themeKey: "safety_wellbeing", concern: "Reduced food intake with swallowing discomfort requires urgent human review." }),
      makeScenario({ key: "willow-4", collector: 4, status: "draft", days: 0, attendance: 14, activityType: "creative", sessionMinutes: 40, attentionMinute: 25, earlyDepartures: 1, engagement: 3, lonelinessMentions: 0, languages: ["mandarin"], observation: "草稿：下午手工活动中出现疲劳迹象，尚未记录午休、用餐和活动前状态。", alternatives: ["fatigue", "activity_design"], nextAction: "补充基线和当天情境后再提交。", themeKey: "safety_wellbeing", concern: "The fatigue signal lacks baseline and context." }),
    ],
  },
];

function stableUuid(key: string) {
  const hex = createHash("sha256").update(`${SCENARIO_KEY}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function daysAgo(days: number, hour = 17) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

function statusValues(status: ScenarioStatus) {
  if (status === "draft") return { recordStatus: "draft", reviewStatus: "not_submitted", privacyStatus: "clear", snapshot: false };
  if (status === "approved" || status === "safety_pending") return { recordStatus: "submitted", reviewStatus: "approved", privacyStatus: "clear", snapshot: true };
  if (status === "needs_completion") return { recordStatus: "draft", reviewStatus: "needs_completion", privacyStatus: "clear", snapshot: true };
  if (status === "privacy_pending") return { recordStatus: "submitted", reviewStatus: "pending", privacyStatus: "flagged", snapshot: true };
  return { recordStatus: "submitted", reviewStatus: "pending", privacyStatus: "clear", snapshot: true };
}

async function putFixtureObject(key: string, body: Buffer, contentType: string) {
  const backend = process.env.STORAGE_BACKEND?.trim().toLowerCase() ?? "local";
  if (backend === "local") {
    // npm workspace processes run the web server from apps/web, so a relative
    // UPLOAD_DIR must resolve from the same directory during fixture seeding.
    const configuredDirectory = process.env.UPLOAD_DIR?.trim() || "uploads";
    const directory = path.isAbsolute(configuredDirectory)
      ? configuredDirectory
      : path.resolve("apps/web", configuredDirectory);
    const destination = path.join(directory, key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body);
    return;
  }
  if (backend !== "s3") throw new Error("STORAGE_BACKEND must be local or s3");
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim();
  if (!bucket || !region) throw new Error("S3_BUCKET and S3_REGION/AWS_REGION are required for Dev fixtures");
  const prefix = process.env.S3_PREFIX?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const client = new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" } : {}) });
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: prefix ? `${prefix}/${key}` : key, Body: body, ContentType: contentType, ...(endpoint ? {} : { ServerSideEncryption: "AES256" }) }));
}

const mimeTypes: Record<string, string> = { ".csv": "text/csv", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pdf": "application/pdf", ".png": "image/png", ".txt": "text/plain" };

async function resetBusinessData() {
  await db.execute(sql.raw(`TRUNCATE TABLE sites, templates, programs, user_affiliations, person_groups, tasks, notifications, activity_definitions, visits, records, report_runs, reports, datasets, ask_conversations, jobs, export_jobs, audit_events RESTART IDENTITY CASCADE`));
}

async function synchronizeLocalizedReferenceData() {
  const registryRows = await db.select().from(configRegistries);
  const registryByKey = new Map(registryRows.map((row) => [row.key, row.id]));
  for (const row of LOOKUPS) {
    await db.update(lookups).set({ nameZh: row.nameZh, nameEn: row.nameEn }).where(and(eq(lookups.category, row.category), eq(lookups.key, row.key)));
    const registryId = registryByKey.get(row.category);
    if (registryId) await db.update(configRegistryItems).set({ labelZh: row.nameZh, labelEn: row.nameEn, updatedAt: new Date() }).where(and(eq(configRegistryItems.registryId, registryId), eq(configRegistryItems.key, row.key)));
  }
  for (const theme of CANONICAL_THEMES) await db.update(canonicalThemes).set({ nameZh: theme.nameZh, nameEn: theme.nameEn, definition: theme.definition, updatedAt: new Date() }).where(and(eq(canonicalThemes.key, theme.key), eq(canonicalThemes.version, theme.version)));
}

async function main() {
  const allUsers = await db.select().from(users);
  if (allUsers.some((user) => !user.email.endsWith("@cnpaf.local"))) throw new Error("Mock reset aborted because the target contains non-synthetic users");
  const accountByEmail = new Map(allUsers.map((user) => [user.email, user]));
  const missing = requiredAccounts.filter((email) => !accountByEmail.has(email));
  if (missing.length) throw new Error(`Missing synthetic accounts: ${missing.join(", ")}`);
  const admin = accountByEmail.get(requiredAccounts[0])!;
  const reviewer = accountByEmail.get(requiredAccounts[1])!;
  if (!admin.organizationId) throw new Error("Synthetic admin must belong to an organization");

  await resetBusinessData();
  await synchronizeLocalizedReferenceData();
  const organizationId = admin.organizationId;
  const templateId = stableUuid("template");
  const templateVersionId = stableUuid("template-version");
  const sectionId = stableUuid("template-section");
  await db.transaction(async (tx) => {
    await tx.insert(templates).values({ id: templateId, key: "field-intelligence-follow-up", templateTypeKey: "observation", organizationId, status: "draft", createdById: admin.id });
    await tx.insert(templateVersions).values({ id: templateVersionId, templateId, version: 1, status: "draft", nameEn: "Field Intelligence Signal and Concern Follow-up", nameZh: "一线信号与心理关注跟进表", descriptionEn: "Separates observations, possible concerns, uncertainty, and next verification steps.", descriptionZh: "区分一线观察、潜在心理关注、不确定性与下一步验证。", configuration: { fixture: SCENARIO_KEY }, createdById: admin.id });
    await tx.insert(templateSections).values({ id: sectionId, templateVersionId, key: "signal-concern-follow-up", labelEn: "Signal and concern follow-up", labelZh: "信号与关注跟进", helpTextEn: "Record de-identified observations and alternative explanations.", helpTextZh: "记录去标识化观察与替代解释。", sortOrder: 0 });
    await tx.insert(templateFields).values(fieldDefinitions.map((field, index) => ({ id: stableUuid(`field:${field.key}`), templateSectionId: sectionId, ...field, sortOrder: index, allowMissingReason: field.key === "attention-change-minute", allowCustomEntry: ["language-access", "alternative-explanations"].includes(field.key), validation: field.fieldTypeKey === "rating_scale" ? { min: 1, max: 5 } : field.fieldTypeKey === "number" ? { min: 0, integer: true } : {}, configuration: { fixture: SCENARIO_KEY } })));
    for (const [fieldKey, options] of Object.entries(optionDefinitions)) await tx.insert(templateFieldOptions).values(options.map(([key, labelEn, labelZh], index) => ({ id: stableUuid(`option:${fieldKey}:${key}`), templateFieldId: stableUuid(`field:${fieldKey}`), key, labelEn, labelZh, sortOrder: index, status: "active" })));
    await tx.update(templateVersions).set({ status: "published", publishedAt: daysAgo(30), updatedAt: new Date() }).where(eq(templateVersions.id, templateVersionId));
    await tx.update(templates).set({ status: "published", currentPublishedVersionId: templateVersionId, updatedAt: new Date() }).where(eq(templates.id, templateId));
  });

  const programId = stableUuid("program");
  await db.insert(programs).values({ id: programId, organizationId, key: "field-intelligence-validation-2026", nameEn: "Field Intelligence Validation Program", nameZh: "一线洞察功能验证项目", descriptionEn: "Synthetic, de-identified scenarios for validating the complete evidence workflow.", descriptionZh: "用于验证完整证据工作流的合成去标识化场景。", status: "active", configuration: { fixture: SCENARIO_KEY }, createdById: admin.id });
  await db.insert(programMemberships).values(requiredAccounts.slice(2).map((email) => ({ id: stableUuid(`membership:${email}`), programId, userId: accountByEmail.get(email)!.id, membershipRoleKey: "member", status: "active", assignedById: admin.id })));

  const themeByKey = new Map((await db.select().from(canonicalThemes)).map((theme) => [theme.key, theme]));
  const approvedRecords: Array<{ recordId: string; versionId: string }> = [];
  const attachmentSummary: Array<{ recordKey: string; filename: string }> = [];
  for (const workflow of workflows) {
    const siteId = stableUuid(`site:${workflow.key}`);
    const taskId = stableUuid(`task:${workflow.key}`);
    await db.insert(sites).values({ id: siteId, organizationId, name: workflow.location.name, siteType: workflow.location.siteType, region: "Los Angeles County", city: workflow.location.city, state: "CA", country: "United States", address: `${workflow.location.city}, CA`, canonicalStatus: "canonical", createdById: admin.id });
    await db.insert(tasks).values({ id: taskId, programId, organizationId, templateVersionId, siteId, taskTypeKey: "data_collection", title: workflow.title, instructions: "Record the signal first, avoid diagnosis, identify alternative explanations, and define the next evidence to collect.", status: "open", priority: "high", opensAt: daysAgo(28), dueAt: daysAgo(-7), closesAt: daysAgo(-21), configuration: { fixture: SCENARIO_KEY, workflow: workflow.key }, createdById: admin.id });
    for (const fixture of workflow.records) {
      const state = statusValues(fixture.status);
      const collector = accountByEmail.get(fixture.collector)!;
      const recordId = stableUuid(`record:${fixture.key}`);
      const versionId = stableUuid(`version:${fixture.key}`);
      const assignmentId = stableUuid(`assignment:${fixture.key}`);
      const occurredAt = daysAgo(fixture.days);
      await db.transaction(async (tx) => {
        await tx.insert(taskAssignments).values({ id: assignmentId, taskId, assigneeId: collector.id, assignedById: admin.id, status: state.snapshot ? "completed" : "in_progress", assignedAt: daysAgo(30), startedAt: daysAgo(Math.max(fixture.days + 2, 1)), completedAt: state.snapshot ? occurredAt : null });
        await tx.insert(records).values({ id: recordId, clientRecordId: stableUuid(`client:${fixture.key}`), sourceKind: fixture.sourceKind ?? "field_visit", siteId, organizationId, programId, taskId, taskAssignmentId: assignmentId, createdById: collector.id, collectionPurpose: "program_evaluation", researchUseStatus: fixture.status === "approved" || fixture.status === "safety_pending" ? "approved_for_research" : "not_assessed", recordStatus: state.recordStatus, reviewStatus: state.reviewStatus, aiStatus: "not_required", privacyStatus: state.privacyStatus, headVersionId: versionId, completenessScore: fixture.status === "draft" ? "0.720" : fixture.status === "needs_completion" ? "0.860" : "1.000", createdAt: occurredAt, updatedAt: occurredAt });
        // Build mutable source rows first, then freeze the completed snapshot.
        // The database deliberately rejects structured selections added after
        // a version becomes immutable.
        await tx.insert(recordVersions).values({ id: versionId, recordId, versionNumber: 1, occurredAt, submittedAt: state.snapshot ? occurredAt : null, submittedById: state.snapshot ? collector.id : null, templateVersionId, quantitative: { attendance: fixture.attendance, sessionDurationMinutes: fixture.sessionMinutes, attentionChangeMinute: fixture.attentionMinute, earlyDepartures: fixture.earlyDepartures, engagementRating: fixture.engagement, lonelinessMentions: fixture.lonelinessMentions }, qualitative: fixture.observation, attribution: { fixture: SCENARIO_KEY, translatedSummaryEn: fixture.concern }, piiAttestation: fixture.status !== "privacy_pending", contentLanguage: "zh", localVersion: 1, serverVersion: 1, isSnapshot: false, createdAt: occurredAt, updatedAt: occurredAt });
        const valuesByKey: Record<string, unknown> = { attendance: fixture.attendance, "activity-type": fixture.activityType, "session-minutes": fixture.sessionMinutes, "attention-change-minute": fixture.attentionMinute, "early-departures": fixture.earlyDepartures, "engagement-rating": fixture.engagement, "loneliness-mentions": fixture.lonelinessMentions, "language-access": fixture.languages, "repeated-pattern": fixture.status !== "draft", observation: fixture.observation, "alternative-explanations": fixture.alternatives, "next-action": fixture.nextAction };
        await tx.insert(recordFieldAnswers).values(fieldDefinitions.map((definition, index) => ({ id: stableUuid(`answer:${fixture.key}:${definition.key}`), recordVersionId: versionId, templateVersionId, templateSectionId: sectionId, templateFieldId: stableUuid(`field:${definition.key}`), sectionKey: "signal-concern-follow-up", sectionLabelEn: "Signal and concern follow-up", sectionLabelZh: "信号与关注跟进", sectionSortOrder: 0, fieldKey: definition.key, fieldSortOrder: index, fieldTypeKey: definition.fieldTypeKey, labelEn: definition.labelEn, labelZh: definition.labelZh, value: valuesByKey[definition.key], missingReasonKey: definition.key === "attention-change-minute" && fixture.attentionMinute === null ? "not_observed" : null })));
        for (const [fieldKey, keys] of [["activity-type", [fixture.activityType]], ["language-access", fixture.languages], ["alternative-explanations", fixture.alternatives]] as const) await tx.insert(recordStructuredSelections).values(keys.map((key) => ({ id: stableUuid(`selection:${fixture.key}:${fieldKey}:${key}`), recordVersionId: versionId, templateFieldId: stableUuid(`field:${fieldKey}`), optionId: stableUuid(`option:${fieldKey}:${key}`), value: { key } })));
        if (state.snapshot) await tx.update(recordVersions).set({ isSnapshot: true, updatedAt: occurredAt }).where(eq(recordVersions.id, versionId));
        if (fixture.status === "approved" || fixture.status === "safety_pending") {
          await tx.insert(reviewDecisions).values({ id: stableUuid(`decision:${fixture.key}`), recordId, recordVersionId: versionId, reviewerId: reviewer.id, action: "approve", annotation: "Source, privacy, and evidence-boundary checks completed.", correctionFieldIds: [], findingDecisions: [], createdAt: daysAgo(Math.max(fixture.days - 1, 0)) });
          await tx.insert(concerns).values({ id: stableUuid(`concern:${fixture.key}`), recordId, recordVersionId: versionId, statement: fixture.concern, canonicalThemeId: themeByKey.get(fixture.themeKey)?.id ?? null, origin: fixture.origin ?? "field_observation", evidence: [{ text: fixture.observation.slice(0, 120), start: 0, end: Math.min(120, fixture.observation.length) }], reviewStatus: "approved", aiConfidence: "0.720", createdAt: occurredAt, updatedAt: occurredAt });
          approvedRecords.push({ recordId, versionId });
        }
        if (fixture.status === "needs_completion") {
          const note = "请补充观察日期、发生情境、证据来源和可执行的下一步验证方法。";
          await tx.insert(reviewDecisions).values({ id: stableUuid(`decision:${fixture.key}`), recordId, recordVersionId: versionId, reviewerId: reviewer.id, action: "needs_completion", annotation: note, correctionFieldIds: [stableUuid("field:observation"), stableUuid("field:next-action")], findingDecisions: [], createdAt: daysAgo(Math.max(fixture.days - 1, 0)) });
          await tx.insert(annotations).values({ id: stableUuid(`annotation:${fixture.key}`), recordId, recordVersionId: versionId, authorId: reviewer.id, body: note, visibleToVolunteer: true, createdAt: daysAgo(Math.max(fixture.days - 1, 0)) });
        }
        if (fixture.status === "privacy_pending") await tx.insert(privacyFlags).values({ id: stableUuid(`privacy:${fixture.key}`), recordId, recordVersionId: versionId, status: "open", hits: [{ type: "person_name", start: 0, end: 8, confidence: 0.99 }], createdAt: occurredAt, updatedAt: occurredAt });
        if (fixture.status === "safety_pending") await tx.insert(safetyFlags).values({ id: stableUuid(`safety:${fixture.key}`), recordId, recordVersionId: versionId, statement: "Reduced food intake with reported swallowing discomfort; urgent human review required.", flagType: "urgent_human_review", status: "open", evidence: [{ text: fixture.observation, start: 0, end: fixture.observation.length }], createdAt: occurredAt, updatedAt: occurredAt });
        await tx.insert(auditEvents).values({ id: stableUuid(`audit:${fixture.key}`), actorId: collector.id, action: state.snapshot ? "submit" : "draft.saved", entityType: "record", entityId: recordId, afterState: { fixture: SCENARIO_KEY, status: fixture.status }, metadata: { workflow: workflow.key }, createdAt: occurredAt });
        await tx.update(taskAssignments).set({ recordId, updatedAt: occurredAt }).where(eq(taskAssignments.id, assignmentId));
      });
      for (const filename of fixture.attachments ?? []) {
        const body = await readFile(path.join(FIXTURE_DIR, filename));
        const contentSha256 = createHash("sha256").update(body).digest("hex");
        const storageKey = `records/${recordId}/${contentSha256.slice(0, 12)}-${filename}`;
        const mimeType = mimeTypes[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
        await putFixtureObject(storageKey, body, mimeType);
        await db.insert(attachments).values({ id: stableUuid(`attachment:${fixture.key}:${filename}`), recordVersionId: versionId, kind: mimeType.startsWith("image/") ? "image" : "document", storageKey, mimeType, byteSize: body.byteLength, contentSha256, exifStripped: true, sentToAi: false, createdAt: occurredAt, updatedAt: occurredAt });
        attachmentSummary.push({ recordKey: fixture.key, filename });
      }
    }
  }

  const datasetId = stableUuid("dataset");
  const datasetVersionId = stableUuid("dataset-version");
  const frozenRecords = approvedRecords.slice(0, 12);
  const fieldPolicy = { include: ["structured_answers", "approved_findings", "evidence_excerpts", "collector_notes", "form_version_information", "media_attachments"], exclude: [] };
  await db.transaction(async (tx) => {
    await tx.insert(datasets).values({ id: datasetId, organizationId, programId, name: "心理与行为信号验证数据集", description: "包含注意力、孤独、失落、照护压力、语言可及性与环境调整的已批准证据，以及可选 AI 附件。", status: "active", dataClassification: "approved_evidence", selectionQuery: { recordIds: frozenRecords.map((item) => item.recordId) }, fieldPolicy, headVersionId: null, createdById: admin.id });
    await tx.insert(datasetVersions).values({ id: datasetVersionId, datasetId, versionNumber: 1, status: "building", selectionQuery: { recordIds: frozenRecords.map((item) => item.recordId) }, fieldPolicy, recordCount: frozenRecords.length, contentHash: createHash("sha256").update(JSON.stringify({ frozenRecords, fieldPolicy })).digest("hex"), createdById: admin.id });
    await tx.insert(datasetRecords).values(frozenRecords.map((item, ordinal) => ({ id: stableUuid(`dataset-record:${item.recordId}`), datasetVersionId, recordId: item.recordId, recordVersionId: item.versionId, ordinal, includedFields: fieldPolicy })));
    await tx.update(datasetVersions).set({ status: "ready", updatedAt: new Date() }).where(eq(datasetVersions.id, datasetVersionId));
    await tx.update(datasets).set({ headVersionId: datasetVersionId, updatedAt: new Date() }).where(eq(datasets.id, datasetId));
  });

  const reportTemplateVersion = (await db.select().from(reportTemplateVersions).where(eq(reportTemplateVersions.status, "published")).limit(1))[0] ?? null;
  const reportId = stableUuid("report");
  const reportVersionId = stableUuid("report-version");
  await db.transaction(async (tx) => {
    await tx.insert(reports).values({ id: reportId, organizationId, programId, reportTemplateVersionId: reportTemplateVersion?.id ?? null, title: "一线心理与行为信号初步报告", status: "draft", headVersionId: null, createdById: admin.id });
    await tx.insert(reportVersions).values({ id: reportVersionId, reportId, versionNumber: 1, title: "一线心理与行为信号初步报告", status: "draft", changeSummary: "Synthetic end-to-end validation fixture", filters: {}, evidencePolicy: { approvedOnly: true }, sourceDatasetVersionId: datasetVersionId, createdById: admin.id });
    await tx.insert(reportSections).values([
      { id: stableUuid("report-section:summary"), reportVersionId, sectionKey: "executive-summary", title: "执行摘要", content: "待人工审阅：近期信号集中在活动参与、社会连接与服务可及性。", sortOrder: 0, lastEditedById: admin.id },
      { id: stableUuid("report-section:findings"), reportVersionId, sectionKey: "key-findings", title: "主要发现", content: "注意力变化需与活动设计、疲劳和感官可及性区分；孤独相关表达需结合重复性与情境。", sortOrder: 1, lastEditedById: admin.id },
      { id: stableUuid("report-section:gaps"), reportVersionId, sectionKey: "evidence-gaps", title: "证据缺口", content: "需要更一致地记录活动类型、持续时间、基线与调整后的变化。", sortOrder: 2, lastEditedById: admin.id },
    ]);
    await tx.update(reports).set({ headVersionId: reportVersionId, updatedAt: new Date() }).where(eq(reports.id, reportId));
  });

  const recordCount = workflows.reduce((count, workflow) => count + workflow.records.length, 0);
  const statusCounts = workflows.flatMap((workflow) => workflow.records).reduce<Record<string, number>>((counts, record) => ({ ...counts, [record.status]: (counts[record.status] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ ok: true, target: TARGET, fixture: SCENARIO_KEY, records: recordCount, statusCounts, approvedDatasetRecords: frozenRecords.length, attachments: attachmentSummary, database: databaseIdentity.pathname.replace(/^\//, "") }, null, 2));
}

main().then(() => process.exit(0)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
