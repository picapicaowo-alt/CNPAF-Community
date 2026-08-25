"use client";

import type {
  FormAnswers,
  FormControlKind,
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeFormSection,
  RuntimeRegistryItem,
} from "@cnpaf/shared";
import { resolveRuntimeFormVisibility } from "@cnpaf/shared";
import { DynamicFieldControl } from "./DynamicFieldControl";

type Props = {
  answers: FormAnswers;
  controls: Map<string, FormControlKind>;
  disabled?: boolean;
  fields: RuntimeFormField[];
  locale: "zh" | "en";
  missingReasons?: RuntimeRegistryItem[];
  onChange: (fieldId: string, answer: FormAnswers[string]) => void;
  options: RuntimeFormOption[];
  section: RuntimeFormSection;
  sections: RuntimeFormSection[];
};

export function DynamicFormSection({
  answers,
  controls,
  disabled,
  fields,
  locale,
  missingReasons,
  onChange,
  options,
  section,
  sections,
}: Props) {
  const visibility = resolveRuntimeFormVisibility({ answers, fields, sections });
  if (!visibility.visibleSections.some((candidate) => candidate.id === section.id))
    return null;
  const sectionFields = visibility.visibleFields.filter(
    (field) => field.templateSectionId === section.id,
  );

  return (
    <section className="editor-section stack">
      <div>
        <h2>{locale === "zh" ? section.labelZh : section.labelEn}</h2>
        {(locale === "zh" ? section.helpTextZh : section.helpTextEn) ? (
          <p className="muted">
            {locale === "zh" ? section.helpTextZh : section.helpTextEn}
          </p>
        ) : null}
      </div>
      {sectionFields.map((field) => (
        <DynamicFieldControl
          answer={answers[field.id]}
          control={controls.get(field.fieldTypeKey) ?? "text"}
          disabled={disabled}
          field={field}
          key={field.id}
          locale={locale}
          missingReasons={missingReasons}
          onChange={onChange}
          options={options
            .filter(
              (option) =>
                option.templateFieldId === field.id && option.status === "active",
            )
            .toSorted((left, right) => left.sortOrder - right.sortOrder)}
        />
      ))}
    </section>
  );
}
