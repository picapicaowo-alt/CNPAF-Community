import { apiFetch } from "@/lib/api-client";
import type {
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeFormSection,
} from "@cnpaf/shared";

export function updateSection(
  sectionId: string,
  body: Partial<RuntimeFormSection>,
) {
  return apiFetch<{ section: RuntimeFormSection }>(
    `/api/v1/template-sections/${sectionId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function deleteSection(sectionId: string) {
  return apiFetch<{ deleted: true }>(
    `/api/v1/template-sections/${sectionId}`,
    { method: "DELETE" },
  );
}

export function duplicateSection(sectionId: string) {
  return apiFetch<{ section: RuntimeFormSection }>(
    `/api/v1/template-sections/${sectionId}/duplicate`,
    { method: "POST" },
  );
}

export function reorderSections(versionId: string, orderedIds: string[]) {
  return apiFetch<{ sections: RuntimeFormSection[] }>(
    `/api/v1/template-versions/${versionId}/sections/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    },
  );
}

export function updateField(
  fieldId: string,
  body: Partial<RuntimeFormField> & { templateSectionId?: string },
) {
  return apiFetch<{ field: RuntimeFormField }>(
    `/api/v1/template-fields/${fieldId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function deleteField(fieldId: string) {
  return apiFetch<{ deleted: true }>(`/api/v1/template-fields/${fieldId}`, {
    method: "DELETE",
  });
}

export function duplicateField(fieldId: string) {
  return apiFetch<{ field: RuntimeFormField }>(
    `/api/v1/template-fields/${fieldId}/duplicate`,
    { method: "POST" },
  );
}

export function reorderFields(sectionId: string, orderedIds: string[]) {
  return apiFetch<{ fields: RuntimeFormField[] }>(
    `/api/v1/template-sections/${sectionId}/fields/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    },
  );
}

export function updateOption(
  optionId: string,
  body: Partial<RuntimeFormOption>,
) {
  return apiFetch<{ option: RuntimeFormOption }>(
    `/api/v1/template-field-options/${optionId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function archiveOption(optionId: string) {
  return apiFetch<{ option: RuntimeFormOption }>(
    `/api/v1/template-field-options/${optionId}/archive`,
    { method: "POST" },
  );
}

export function reorderOptions(fieldId: string, orderedIds: string[]) {
  return apiFetch<{ options: RuntimeFormOption[] }>(
    `/api/v1/template-fields/${fieldId}/options/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    },
  );
}
