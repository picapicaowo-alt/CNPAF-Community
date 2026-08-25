"use client";

import { useMemo, useState, type DragEvent } from "react";
import {
  resolveRuntimeFormVisibility,
  type FormAnswers,
  type FormControlKind,
  type RuntimeFormField,
  type RuntimeFormOption,
  type RuntimeFormSection,
  type RuntimeRegistryItem,
} from "@cnpaf/shared";
import { DynamicFieldControl } from "../runtime/DynamicFieldControl";
import { moveIdToTarget } from "./model";

type DropHint = {
  id: string;
  position: "before" | "after";
};

const EMPTY_OPTIONS: RuntimeFormOption[] = [];

type Props = {
  answers: FormAnswers;
  busy: boolean;
  controls: Map<string, FormControlKind>;
  editable: boolean;
  fields: RuntimeFormField[];
  locale: "zh" | "en";
  missingReasons: RuntimeRegistryItem[];
  onChange: (fieldId: string, answer: FormAnswers[string]) => void;
  onReorderFields: (orderedIds: string[]) => Promise<void>;
  onSelectField: (fieldId: string) => void;
  options: RuntimeFormOption[];
  section: RuntimeFormSection;
  sections: RuntimeFormSection[];
  selectedFieldId: string;
};

export function FormBuilderPreview({
  answers,
  busy,
  controls,
  editable,
  fields,
  locale,
  missingReasons,
  onChange,
  onReorderFields,
  onSelectField,
  options,
  section,
  sections,
  selectedFieldId,
}: Props) {
  const [draggedId, setDraggedId] = useState("");
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const visibility = useMemo(
    () => resolveRuntimeFormVisibility({ answers, fields, sections }),
    [answers, fields, sections],
  );
  const sectionVisible = visibility.visibleSections.some(
    (candidate) => candidate.id === section.id,
  );
  const sectionFields = useMemo(
    () => fields.filter((field) => field.templateSectionId === section.id),
    [fields, section.id],
  );
  const visibleFieldIds = useMemo(
    () => new Set(visibility.visibleFields.map((field) => field.id)),
    [visibility.visibleFields],
  );
  const optionsByField = useMemo(() => {
    const grouped = new Map<string, RuntimeFormOption[]>();
    for (const option of options) {
      if (option.status !== "active") continue;
      const current = grouped.get(option.templateFieldId) ?? [];
      current.push(option);
      grouped.set(option.templateFieldId, current);
    }
    for (const [fieldId, fieldOptions] of grouped)
      grouped.set(
        fieldId,
        fieldOptions.toSorted((left, right) => left.sortOrder - right.sortOrder),
      );
    return grouped;
  }, [options]);

  function updateDropHint(event: DragEvent<HTMLElement>, fieldId: string) {
    if (!draggedId || draggedId === fieldId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropHint({
      id: fieldId,
      position:
        event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    });
  }

  function drop(event: DragEvent<HTMLElement>, fieldId: string) {
    event.preventDefault();
    if (!draggedId) return;
    const position = dropHint?.id === fieldId ? dropHint.position : "before";
    const orderedIds = moveIdToTarget(
      sectionFields.map((field) => field.id),
      draggedId,
      fieldId,
      position,
    );
    setDraggedId("");
    setDropHint(null);
    void onReorderFields(orderedIds);
  }

  return (
    <section className="builder-form-surface">
      <div className="builder-form-heading">
        <div className="eyebrow">
          {locale === "zh" ? "实时采集表单" : "Live collection form"}
        </div>
        <h2>{locale === "zh" ? section.labelZh : section.labelEn}</h2>
        {(locale === "zh" ? section.helpTextZh : section.helpTextEn) ? (
          <p className="muted">
            {locale === "zh" ? section.helpTextZh : section.helpTextEn}
          </p>
        ) : null}
      </div>
      {!sectionVisible ? (
        <div className="feedback feedback-warning">
          {locale === "zh"
            ? "根据当前预览答案，此章节会被隐藏。更改前面题目的答案即可测试显示条件。"
            : "This section is hidden for the current preview answers. Change earlier answers to test its visibility rules."}
        </div>
      ) : null}
      <div className="builder-preview-fields">
        {sectionFields.map((field, index) => {
          const visible = visibleFieldIds.has(field.id);
          return (
            <div
              className={`builder-preview-field${selectedFieldId === field.id ? " selected" : ""}${draggedId === field.id ? " dragging" : ""}${dropHint?.id === field.id ? ` drop-${dropHint.position}` : ""}${visible ? "" : " conditionally-hidden"}`}
              key={field.id}
              onClick={() => onSelectField(field.id)}
              onDragOver={(event) => updateDropHint(event, field.id)}
              onDrop={(event) => drop(event, field.id)}
            >
              <div className="builder-field-affordances">
                {editable ? (
                  <button
                    aria-label={
                      locale === "zh"
                        ? `拖动“${field.labelZh}”调整顺序`
                        : `Drag “${field.labelEn}” to reorder`
                    }
                    className="builder-preview-drag-handle"
                    disabled={busy}
                    draggable={!busy}
                    onClick={(event) => event.stopPropagation()}
                    onDragEnd={() => {
                      setDraggedId("");
                      setDropHint(null);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", field.id);
                      setDraggedId(field.id);
                    }}
                    type="button"
                  >
                    ⋮⋮
                  </button>
                ) : null}
                <button
                  className="builder-preview-edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectField(field.id);
                  }}
                  type="button"
                >
                  {locale === "zh" ? "设置" : "Edit"}
                </button>
              </div>
              {!visible ? (
                <span className="builder-hidden-label">
                  {locale === "zh" ? "当前条件下隐藏" : "Hidden by conditions"}
                </span>
              ) : null}
              <span className="sr-only">
                {locale === "zh" ? `第 ${index + 1} 题` : `Field ${index + 1}`}
              </span>
              <div onClick={(event) => event.stopPropagation()}>
                <DynamicFieldControl
                  answer={answers[field.id]}
                  control={controls.get(field.fieldTypeKey) ?? "text"}
                  field={field}
                  locale={locale}
                  missingReasons={missingReasons}
                  onChange={onChange}
                  options={optionsByField.get(field.id) ?? EMPTY_OPTIONS}
                />
              </div>
            </div>
          );
        })}
        {!sectionFields.length ? (
          <div className="builder-preview-empty">
            <p>
              {locale === "zh"
                ? "这个章节还没有题目。点击“添加题目”开始设计。"
                : "This section has no fields yet. Add a field to start designing."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
