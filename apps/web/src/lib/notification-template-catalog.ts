export const NOTIFICATION_TEMPLATE_VARIABLE_PATTERN = /{{\s*([a-z][a-z0-9_]*)\s*}}/g;

export type NotificationTemplateDefinition = {
  kindKey: string;
  labelEn: string;
  labelZh: string;
  descriptionEn: string;
  descriptionZh: string;
  defaultTitleTemplate: string;
  defaultBodyTemplate: string;
  defaultEmailSubjectTemplate: string;
  defaultActionLabelTemplate: string;
  variables: readonly string[];
};

const commonVariables = [
  "recipient_name",
  "recipient_email",
  "organization_name",
  "app_url",
  "action_url",
  "message",
  "entity_name",
] as const;

export const NOTIFICATION_TEMPLATE_CATALOG: readonly NotificationTemplateDefinition[] = [
  {
    kindKey: "account_onboarding",
    labelEn: "Account onboarding",
    labelZh: "账号入职欢迎",
    descriptionEn: "Sent when a person is first added to the organization.",
    descriptionZh: "人员首次加入机构时发送。",
    defaultTitleTemplate: "Welcome to CNPAF Community",
    defaultBodyTemplate: "Hello {{recipient_name}}, welcome to {{organization_name}}. Use the secure link below to set your password and access CNPAF Community. {{message}}",
    defaultEmailSubjectTemplate: "Welcome to CNPAF Community",
    defaultActionLabelTemplate: "Set up my account",
    variables: commonVariables,
  },
  {
    kindKey: "password_reset_requested",
    labelEn: "Password reset",
    labelZh: "密码重置",
    descriptionEn: "Sent after a valid forgot-password request or an administrator reset.",
    descriptionZh: "有效的忘记密码请求或管理员重置密码后发送。",
    defaultTitleTemplate: "Reset your CNPAF Community password",
    defaultBodyTemplate: "Hello {{recipient_name}}, use the secure link below to choose a new password. If you did not request this, you can ignore this message.",
    defaultEmailSubjectTemplate: "Reset your CNPAF Community password",
    defaultActionLabelTemplate: "Reset password",
    variables: commonVariables,
  },
  {
    kindKey: "task_assigned",
    labelEn: "Task / activity assigned",
    labelZh: "分配任务 / 活动",
    descriptionEn: "Sent when a new task or activity is assigned.",
    descriptionZh: "新的任务或活动被分配时发送。",
    defaultTitleTemplate: "New task assigned: {{entity_name}}",
    defaultBodyTemplate: "You have been assigned a new task or activity: {{entity_name}}. {{message}}",
    defaultEmailSubjectTemplate: "New task assigned: {{entity_name}}",
    defaultActionLabelTemplate: "View task",
    variables: commonVariables,
  },
  {
    kindKey: "task_reassigned",
    labelEn: "Task / activity reassigned",
    labelZh: "重新分配任务 / 活动",
    descriptionEn: "Sent when an existing task or activity is assigned again.",
    descriptionZh: "现有任务或活动被重新分配时发送。",
    defaultTitleTemplate: "Task reassigned: {{entity_name}}",
    defaultBodyTemplate: "A task or activity has been reassigned to you: {{entity_name}}. {{message}}",
    defaultEmailSubjectTemplate: "Task reassigned: {{entity_name}}",
    defaultActionLabelTemplate: "View task",
    variables: commonVariables,
  },
  {
    kindKey: "task_reminder",
    labelEn: "Task / activity reminder",
    labelZh: "任务 / 活动提醒",
    descriptionEn: "Sent automatically or manually as a task reminder.",
    descriptionZh: "自动或由管理员手动发送的任务提醒。",
    defaultTitleTemplate: "Task reminder: {{entity_name}}",
    defaultBodyTemplate: "This is a reminder for {{entity_name}}. {{message}}",
    defaultEmailSubjectTemplate: "Task reminder: {{entity_name}}",
    defaultActionLabelTemplate: "View task",
    variables: commonVariables,
  },
  {
    kindKey: "group_membership_changed",
    labelEn: "Group membership changed",
    labelZh: "人员分组变更",
    descriptionEn: "Sent when a person is added to or removed from a group.",
    descriptionZh: "人员被加入或移出分组时发送。",
    defaultTitleTemplate: "Your CNPAF group membership changed",
    defaultBodyTemplate: "Your group membership changed: {{message}}",
    defaultEmailSubjectTemplate: "Your CNPAF group membership changed",
    defaultActionLabelTemplate: "Review my profile",
    variables: commonVariables,
  },
  {
    kindKey: "program_membership_changed",
    labelEn: "Program membership changed",
    labelZh: "项目归属变更",
    descriptionEn: "Sent when a person is added to or removed from a program.",
    descriptionZh: "人员被加入或移出项目时发送。",
    defaultTitleTemplate: "Your CNPAF program membership changed",
    defaultBodyTemplate: "Your program membership changed: {{message}}",
    defaultEmailSubjectTemplate: "Your CNPAF program membership changed",
    defaultActionLabelTemplate: "Review my profile",
    variables: commonVariables,
  },
  {
    kindKey: "access_changed",
    labelEn: "Role or access changed",
    labelZh: "角色或权限变更",
    descriptionEn: "Sent after a role, permission, or access scope changes.",
    descriptionZh: "角色、权限或访问范围变更后发送。",
    defaultTitleTemplate: "Your CNPAF access changed",
    defaultBodyTemplate: "Your role or access changed: {{message}}",
    defaultEmailSubjectTemplate: "Your CNPAF access changed",
    defaultActionLabelTemplate: "Review my account",
    variables: commonVariables,
  },
  {
    kindKey: "affiliation_changed",
    labelEn: "School or institution changed",
    labelZh: "学校或机构归属变更",
    descriptionEn: "Sent when a school or institution affiliation changes.",
    descriptionZh: "学校或机构归属变更时发送。",
    defaultTitleTemplate: "Your CNPAF affiliation changed",
    defaultBodyTemplate: "Your school or institution affiliation changed: {{message}}",
    defaultEmailSubjectTemplate: "Your CNPAF affiliation changed",
    defaultActionLabelTemplate: "Review my profile",
    variables: commonVariables,
  },
] as const;

export function getNotificationTemplateDefinition(kindKey: string) {
  return NOTIFICATION_TEMPLATE_CATALOG.find((item) => item.kindKey === kindKey);
}

export function templateVariables(template: string) {
  return [...template.matchAll(NOTIFICATION_TEMPLATE_VARIABLE_PATTERN)].map((match) => match[1]!);
}

export function renderNotificationTemplate(
  template: string,
  values: Record<string, string | null | undefined>,
) {
  return template.replace(
    NOTIFICATION_TEMPLATE_VARIABLE_PATTERN,
    (_placeholder, key: string) => values[key]?.trim() ?? "",
  ).replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
}
