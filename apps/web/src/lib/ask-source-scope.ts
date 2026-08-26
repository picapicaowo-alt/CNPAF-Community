/**
 * Live conversations may only cite the current record head. Dataset-scoped
 * conversations intentionally cite the immutable record versions frozen into
 * that Dataset version.
 */
export function isAskSourceVersionInScope(input: {
  datasetVersionId?: string;
  frozenRecordVersionIds: ReadonlySet<string>;
  recordHeadVersionId: string | null;
  recordVersionId: string;
}) {
  return input.datasetVersionId
    ? input.frozenRecordVersionIds.has(input.recordVersionId)
    : input.recordHeadVersionId === input.recordVersionId;
}
