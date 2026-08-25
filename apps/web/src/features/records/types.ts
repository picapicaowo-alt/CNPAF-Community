export type RecordFieldAnswer = {
  id: string;
  recordVersionId: string;
  templateFieldId: string;
  sectionKey: string;
  sectionLabelEn: string;
  sectionLabelZh: string;
  sectionSortOrder: number;
  fieldKey: string;
  fieldSortOrder: number;
  fieldTypeKey: string;
  labelEn: string;
  labelZh: string;
  value: unknown;
  missingReasonKey?: string | null;
  customText?: string | null;
};
