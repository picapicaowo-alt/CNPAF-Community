import type {
  FormAnswer,
  FormAnswers,
  FormControlKind,
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeFormSection,
} from "@cnpaf/shared";
import { hasFormAnswerValue, resolveRuntimeFormVisibility } from "@cnpaf/shared";

export function serializeFormAnswers({
  answers,
  controls,
  fields,
  locale,
  options,
  sections,
}: {
  answers: FormAnswers;
  controls: Map<string, FormControlKind>;
  fields: RuntimeFormField[];
  locale: "zh" | "en";
  options: RuntimeFormOption[];
  sections: RuntimeFormSection[];
}) {
  const structuredSelections: Array<{
    templateFieldId: string;
    optionId: string;
    value: Record<string, unknown>;
  }> = [];
  const quantitative: Record<
    string,
    { reason: string; value: number | null }
  > = {};
  const qualitativeLines: string[] = [];
  const customEntries: Array<{
    templateFieldId: string;
    categoryId: null;
    customText: string;
  }> = [];
  const fieldAnswers: Array<{
    templateFieldId: string;
    value: FormAnswer["value"] | null;
    missingReasonKey?: string;
    customText?: string;
  }> = [];

  const { visibleFields } = resolveRuntimeFormVisibility({
    answers,
    fields,
    sections,
  });
  for (const field of visibleFields) {
    const answer = answers[field.id];
    if (!hasFormAnswerValue(answer) && !answer?.customText?.trim()) continue;
    const control = controls.get(field.fieldTypeKey) ?? "text";
    const normalizedValue = normalizeValue(control, answer?.value);
    fieldAnswers.push({
      templateFieldId: field.id,
      value: normalizedValue,
      ...(answer?.missingReasonKey
        ? { missingReasonKey: answer.missingReasonKey }
        : {}),
      ...(answer?.customText?.trim()
        ? { customText: answer.customText.trim() }
        : {}),
    });

    if (control === "multi") {
      for (const optionKey of Array.isArray(answer?.value) ? answer.value : []) {
        const option = options.find(
          (candidate) =>
            candidate.templateFieldId === field.id &&
            (candidate.key === optionKey || candidate.id === optionKey),
        );
        if (option)
          structuredSelections.push({
            templateFieldId: field.id,
            optionId: option.id,
            value: { optionKey: option.key },
          });
      }
    } else if (
      (control === "single" || control === "dropdown") &&
      typeof answer?.value === "string"
    ) {
      const option = options.find(
        (candidate) =>
          candidate.templateFieldId === field.id &&
          (candidate.key === answer.value || candidate.id === answer.value),
      );
      if (option)
        structuredSelections.push({
          templateFieldId: field.id,
          optionId: option.id,
          value: { optionKey: option.key },
        });
    } else if (control === "number" || control === "rating") {
      quantitative[field.key] = {
        reason: answer?.missingReasonKey ?? "recorded",
        value:
          answer?.missingReasonKey || normalizedValue === null
            ? null
            : Number(normalizedValue),
      };
    } else if (answer?.missingReasonKey) {
      qualitativeLines.push(
        `${locale === "zh" ? field.labelZh : field.labelEn}: [${answer.missingReasonKey}]`,
      );
    } else if (normalizedValue !== null) {
      qualitativeLines.push(
        `${locale === "zh" ? field.labelZh : field.labelEn}: ${String(normalizedValue)}`,
      );
    }

    if (answer?.customText?.trim())
      customEntries.push({
        templateFieldId: field.id,
        categoryId: null,
        customText: answer.customText.trim(),
      });
  }

  return {
    customEntries,
    fieldAnswers,
    qualitative: qualitativeLines.join("\n"),
    quantitative,
    structuredSelections,
  };
}

function normalizeValue(
  control: FormControlKind,
  value: FormAnswer["value"],
) {
  if (value === undefined || value === "") return null;
  if (control === "date" && typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return value;
}
