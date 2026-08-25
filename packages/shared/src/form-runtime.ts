export type FormControlKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "single"
  | "multi"
  | "boolean"
  | "rating"
  | "dropdown"
  | "display";

export type FormScalarAnswer = string | number | boolean | string[];

export type FormAnswer = {
  value?: FormScalarAnswer;
  missingReasonKey?: string;
  customText?: string;
};

export type FormAnswers = Record<string, FormAnswer>;

export type FormVisibilityOperator =
  | "equals"
  | "not_equals"
  | "includes"
  | "not_includes"
  | "answered"
  | "not_answered";

export type FormVisibilityCondition = {
  fieldKey: string;
  operator: FormVisibilityOperator;
  value?: FormScalarAnswer;
};

export type FormBranchAction = "go_to_section" | "end_form";

export type FormBranchRule = {
  operator: FormVisibilityOperator;
  value?: FormScalarAnswer;
  action: FormBranchAction;
  targetSectionKey?: string;
};

export type ResolvedFormBranch = FormBranchRule & {
  sourceFieldKey: string;
};

export type RuntimeFormSection = {
  id: string;
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  sortOrder: number;
  configuration?: Record<string, unknown>;
};

export type RuntimeFormField = {
  id: string;
  templateSectionId: string;
  key: string;
  fieldTypeKey: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  placeholderEn?: string | null;
  placeholderZh?: string | null;
  required: boolean;
  allowMissingReason: boolean;
  allowCustomEntry: boolean;
  sortOrder: number;
  validation: Record<string, unknown>;
  visibilityConditions?: FormVisibilityCondition[];
  branchingLogic?: FormBranchRule[];
  configuration?: Record<string, unknown>;
};

export type RuntimeFormOption = {
  id: string;
  templateFieldId: string;
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  status: string;
  sortOrder: number;
};

export type RuntimeRegistryItem = {
  key: string;
  labelEn: string;
  labelZh: string;
  metadata?: Record<string, unknown>;
};

const CONTROL_KINDS = new Set<FormControlKind>([
  "text",
  "textarea",
  "number",
  "date",
  "single",
  "multi",
  "boolean",
  "rating",
  "dropdown",
  "display",
]);

export function configuredFormControl(
  metadata?: Record<string, unknown>,
): FormControlKind {
  const control = String(metadata?.control ?? "text") as FormControlKind;
  return CONTROL_KINDS.has(control) ? control : "text";
}

export function formFieldValidationError(
  control: FormControlKind,
  validation: Record<string, unknown> = {},
) {
  const min = numericValidationValue(validation, "min");
  const max = numericValidationValue(validation, "max");
  const minLength = numericValidationValue(validation, "minLength");
  const maxLength = numericValidationValue(validation, "maxLength");

  if (control === "rating") {
    if (
      invalidNumericValidationValue(validation, "min") ||
      invalidNumericValidationValue(validation, "max")
    )
      return "Rating limits must be finite numbers";
    const first = min ?? 1;
    const last = max ?? 5;
    if (!Number.isInteger(first) || !Number.isInteger(last))
      return "Rating limits must be whole numbers";
    if (first < 0) return "Rating minimum cannot be below 0";
    if (last > 20) return "Rating maximum cannot exceed 20";
    if (first > last) return "Rating minimum cannot exceed its maximum";
    if (last - first + 1 > 20)
      return "A rating scale can contain at most 20 values";
  }

  if (control === "number") {
    if (
      invalidNumericValidationValue(validation, "min") ||
      invalidNumericValidationValue(validation, "max")
    )
      return "Number limits must be finite numbers";
    if (min !== undefined && max !== undefined && min > max)
      return "Minimum cannot exceed maximum";
  }

  if (control === "text" || control === "textarea") {
    if (
      invalidNumericValidationValue(validation, "minLength") ||
      invalidNumericValidationValue(validation, "maxLength")
    )
      return "Text length limits must be finite numbers";
    if (
      (minLength !== undefined &&
        (!Number.isInteger(minLength) || minLength < 0)) ||
      (maxLength !== undefined &&
        (!Number.isInteger(maxLength) || maxLength < 0))
    )
      return "Text length limits must be non-negative whole numbers";
    if (
      minLength !== undefined &&
      maxLength !== undefined &&
      minLength > maxLength
    )
      return "Minimum text length cannot exceed maximum text length";
  }

  return null;
}

export function formRatingValues(
  validation: Record<string, unknown> = {},
) {
  if (formFieldValidationError("rating", validation)) return [];
  const first = numericValidationValue(validation, "min") ?? 1;
  const last = numericValidationValue(validation, "max") ?? 5;
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function numericValidationValue(
  validation: Record<string, unknown>,
  key: string,
) {
  const value = validation[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function invalidNumericValidationValue(
  validation: Record<string, unknown>,
  key: string,
) {
  if (!(key in validation) || validation[key] === undefined) return false;
  return numericValidationValue(validation, key) === undefined;
}

export function hasFormAnswerValue(answer?: FormAnswer) {
  if (answer?.missingReasonKey) return true;
  const value = answer?.value;
  return Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== "";
}

export function normalizeLegacyFormAnswers(
  answers: Record<string, FormAnswer | FormScalarAnswer>,
): FormAnswers {
  return Object.fromEntries(
    Object.entries(answers).map(([fieldId, answer]) => [
      fieldId,
      answer && typeof answer === "object" && !Array.isArray(answer)
        ? answer
        : { value: answer as FormScalarAnswer },
    ]),
  );
}

const VISIBILITY_OPERATORS = new Set<FormVisibilityOperator>([
  "equals",
  "not_equals",
  "includes",
  "not_includes",
  "answered",
  "not_answered",
]);

export function parseFormVisibilityConditions(
  input: unknown,
): FormVisibilityCondition[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return [];
    const condition = candidate as Record<string, unknown>;
    const fieldKey =
      typeof condition.fieldKey === "string" ? condition.fieldKey.trim() : "";
    const operator = condition.operator as FormVisibilityOperator;
    if (!fieldKey || !VISIBILITY_OPERATORS.has(operator)) return [];
    const value = condition.value;
    const validValue =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"));
    return [
      {
        fieldKey,
        operator,
        ...(validValue ? { value: value as FormScalarAnswer } : {}),
      },
    ];
  });
}

const BRANCH_ACTIONS = new Set<FormBranchAction>([
  "go_to_section",
  "end_form",
]);

export function parseFormBranchRules(input: unknown): FormBranchRule[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return [];
    const rule = candidate as Record<string, unknown>;
    const operator = rule.operator as FormVisibilityOperator;
    const action = rule.action as FormBranchAction;
    if (!VISIBILITY_OPERATORS.has(operator) || !BRANCH_ACTIONS.has(action))
      return [];
    const targetSectionKey =
      typeof rule.targetSectionKey === "string"
        ? rule.targetSectionKey.trim()
        : "";
    if (action === "go_to_section" && !targetSectionKey) return [];
    const value = rule.value;
    const validValue =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"));
    return [
      {
        operator,
        action,
        ...(validValue ? { value: value as FormScalarAnswer } : {}),
        ...(action === "go_to_section" ? { targetSectionKey } : {}),
      },
    ];
  });
}

export function resolveFormBranchAction({
  answers,
  fields,
  sectionId,
  visibleFieldIds,
}: {
  answers: FormAnswers;
  fields: RuntimeFormField[];
  sectionId: string;
  visibleFieldIds: Set<string>;
}): ResolvedFormBranch | null {
  const sectionFields = fields.filter(
      (field) =>
        field.templateSectionId === sectionId && visibleFieldIds.has(field.id),
    );
  sectionFields.sort((left, right) => left.sortOrder - right.sortOrder);
  for (const field of sectionFields) {
    for (const rule of parseFormBranchRules(field.branchingLogic)) {
      if (
        formVisibilityConditionsPass({
          answers,
          conditions: [
            {
              fieldKey: field.key,
              operator: rule.operator,
              value: rule.value,
            },
          ],
          fields,
          visibleFieldIds,
        })
      )
        return { ...rule, sourceFieldKey: field.key };
    }
  }
  return null;
}

export function formVisibilityConditionsPass({
  answers,
  conditions,
  fields,
  visibleFieldIds,
}: {
  answers: FormAnswers;
  conditions: FormVisibilityCondition[];
  fields: RuntimeFormField[];
  visibleFieldIds?: Set<string>;
}) {
  if (!conditions.length) return true;
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  return conditions.every((condition) => {
    const source = fieldByKey.get(condition.fieldKey);
    if (!source || (visibleFieldIds && !visibleFieldIds.has(source.id)))
      return false;
    const answer = answers[source.id];
    const answered = hasFormAnswerValue(answer);
    if (condition.operator === "answered") return answered;
    if (condition.operator === "not_answered") return !answered;
    if (!answered || answer?.missingReasonKey) return false;
    const value = answer?.value;
    if (condition.operator === "includes")
      return Array.isArray(value)
        ? value.some((item) => equalFormValues(item, condition.value))
        : typeof value === "string" && typeof condition.value === "string"
          ? value.includes(condition.value)
          : false;
    if (condition.operator === "not_includes")
      return Array.isArray(value)
        ? !value.some((item) => equalFormValues(item, condition.value))
        : typeof value === "string" && typeof condition.value === "string"
          ? !value.includes(condition.value)
          : true;
    const equals = equalFormValues(value, condition.value);
    return condition.operator === "equals" ? equals : !equals;
  });
}

export function resolveRuntimeFormVisibility({
  answers,
  fields,
  sections,
}: {
  answers: FormAnswers;
  fields: RuntimeFormField[];
  sections: RuntimeFormSection[];
}) {
  const visibleFieldIds = new Set<string>();
  const visibleSections: RuntimeFormSection[] = [];
  const visibleFields: RuntimeFormField[] = [];
  for (const section of [...sections].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const sectionConditions = parseFormVisibilityConditions(
      section.configuration?.visibilityConditions,
    );
    if (
      !formVisibilityConditionsPass({
        answers,
        conditions: sectionConditions,
        fields,
        visibleFieldIds,
      })
    )
      continue;
    visibleSections.push(section);
    for (const field of fields
      .filter((candidate) => candidate.templateSectionId === section.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)) {
      if (
        formVisibilityConditionsPass({
          answers,
          conditions: parseFormVisibilityConditions(
            field.visibilityConditions,
          ),
          fields,
          visibleFieldIds,
        })
      ) {
        visibleFieldIds.add(field.id);
        visibleFields.push(field);
      }
    }
  }
  return { visibleFieldIds, visibleFields, visibleSections };
}

function equalFormValues(left: unknown, right: unknown) {
  if (typeof left === "number" || typeof right === "number")
    return Number(left) === Number(right);
  return left === right;
}
