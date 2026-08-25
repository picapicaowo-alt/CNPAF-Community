"use client";

import { useMemo, useState, type DragEvent } from "react";
import type { RuntimeFormField, RuntimeFormSection } from "@cnpaf/shared";
import { moveIdToTarget } from "./model";

type DropHint = {
  id: string;
  kind: "field" | "section";
  position: "before" | "after";
};

type DragItem = {
  id: string;
  kind: "field" | "section";
};

type Props = {
  busy: boolean;
  editable: boolean;
  fields: RuntimeFormField[];
  locale: "zh" | "en";
  onReorderFields: (sectionId: string, orderedIds: string[]) => Promise<void>;
  onReorderSections: (orderedIds: string[]) => Promise<void>;
  onSelectField: (fieldId: string) => void;
  onSelectSection: (sectionId: string) => void;
  sections: RuntimeFormSection[];
  selectedFieldId: string;
  selectedSectionId: string;
  settingsTarget: "field" | "section" | null;
};

export function FormBuilderOutline({
  busy,
  editable,
  fields,
  locale,
  onReorderFields,
  onReorderSections,
  onSelectField,
  onSelectSection,
  sections,
  selectedFieldId,
  selectedSectionId,
  settingsTarget,
}: Props) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const selectedSectionFields = useMemo(
    () =>
      fields.filter((field) => field.templateSectionId === selectedSectionId),
    [fields, selectedSectionId],
  );
  const fieldCountBySection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const field of fields)
      counts.set(
        field.templateSectionId,
        (counts.get(field.templateSectionId) ?? 0) + 1,
      );
    return counts;
  }, [fields]);

  function startDrag(
    event: DragEvent<HTMLElement>,
    kind: DragItem["kind"],
    id: string,
  ) {
    if (!editable || busy) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDragItem({ id, kind });
  }

  function updateDropHint(
    event: DragEvent<HTMLElement>,
    kind: DropHint["kind"],
    id: string,
  ) {
    if (!dragItem || dragItem.kind !== kind || dragItem.id === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropHint({
      id,
      kind,
      position:
        event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    });
  }

  function drop(event: DragEvent<HTMLElement>, hint: DropHint) {
    event.preventDefault();
    if (!dragItem || dragItem.kind !== hint.kind) return;
    if (hint.kind === "section") {
      const orderedIds = moveIdToTarget(
        sections.map((section) => section.id),
        dragItem.id,
        hint.id,
        hint.position,
      );
      void onReorderSections(orderedIds);
    } else {
      const orderedIds = moveIdToTarget(
        selectedSectionFields.map((field) => field.id),
        dragItem.id,
        hint.id,
        hint.position,
      );
      void onReorderFields(selectedSectionId, orderedIds);
    }
    setDragItem(null);
    setDropHint(null);
  }

  function dropClass(kind: DropHint["kind"], id: string) {
    if (dropHint?.kind !== kind || dropHint.id !== id) return "";
    return ` drop-${dropHint.position}`;
  }

  return (
    <nav
      aria-label={locale === "zh" ? "表单结构" : "Form structure"}
      className="builder-outline"
    >
      <div className="builder-outline-heading">
        <div>
          <h2>{locale === "zh" ? "表单结构" : "Form structure"}</h2>
          <p className="caption">
            {editable
              ? locale === "zh"
                ? "拖动章节或题目调整顺序"
                : "Drag sections or fields to reorder"
              : locale === "zh"
                ? "当前版本为只读"
                : "This version is read-only"}
          </p>
        </div>
      </div>
      <div className="builder-section-list">
        {sections.map((section, index) => {
          const selected = section.id === selectedSectionId;
          const count = fieldCountBySection.get(section.id) ?? 0;
          return (
            <div className="builder-outline-group" key={section.id}>
              <div
                className={`builder-outline-row builder-section-row${selected ? " active" : ""}${dragItem?.id === section.id ? " dragging" : ""}${dropClass("section", section.id)}`}
                draggable={editable && !busy}
                onDragEnd={() => {
                  setDragItem(null);
                  setDropHint(null);
                }}
                onDragOver={(event) =>
                  updateDropHint(event, "section", section.id)
                }
                onDragStart={(event) =>
                  startDrag(event, "section", section.id)
                }
                onDrop={(event) =>
                  drop(event, dropHint ?? { id: section.id, kind: "section", position: "before" })
                }
              >
                {editable ? (
                  <span aria-hidden="true" className="builder-drag-handle">
                    ⋮⋮
                  </span>
                ) : null}
                <button
                  aria-pressed={selected && settingsTarget === "section"}
                  className="builder-outline-button"
                  onClick={() => onSelectSection(section.id)}
                  type="button"
                >
                  <span className="builder-outline-label">
                    <span className="builder-outline-index">{index + 1}</span>
                    <span>
                      {locale === "zh" ? section.labelZh : section.labelEn}
                    </span>
                  </span>
                  <span className="caption">{count}</span>
                </button>
              </div>
              {selected ? (
                <div className="builder-field-list">
                  {selectedSectionFields.map((field, fieldIndex) => (
                    <div
                      className={`builder-outline-row builder-field-row${selectedFieldId === field.id ? " active" : ""}${dragItem?.id === field.id ? " dragging" : ""}${dropClass("field", field.id)}`}
                      draggable={editable && !busy}
                      key={field.id}
                      onDragEnd={() => {
                        setDragItem(null);
                        setDropHint(null);
                      }}
                      onDragOver={(event) =>
                        updateDropHint(event, "field", field.id)
                      }
                      onDragStart={(event) =>
                        startDrag(event, "field", field.id)
                      }
                      onDrop={(event) =>
                        drop(event, dropHint ?? { id: field.id, kind: "field", position: "before" })
                      }
                    >
                      {editable ? (
                        <span aria-hidden="true" className="builder-drag-handle">
                          ⋮⋮
                        </span>
                      ) : null}
                      <button
                        aria-pressed={
                          selectedFieldId === field.id &&
                          settingsTarget === "field"
                        }
                        className="builder-outline-button"
                        onClick={() => onSelectField(field.id)}
                        type="button"
                      >
                        <span className="builder-outline-label">
                          <span className="builder-field-index">
                            {fieldIndex + 1}
                          </span>
                          <span>
                            {locale === "zh" ? field.labelZh : field.labelEn}
                            {field.required ? " *" : ""}
                          </span>
                        </span>
                      </button>
                    </div>
                  ))}
                  {!selectedSectionFields.length ? (
                    <p className="builder-outline-empty caption">
                      {locale === "zh" ? "此章节暂无题目" : "No fields yet"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
