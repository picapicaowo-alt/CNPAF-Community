type AskCitationDisplaySource = {
  id: string;
  label: string;
  displayLabel?: string;
  href?: string;
};

/**
 * Keep database UUIDs in the structured citation contract while presenting
 * the corresponding live, human-readable source label in answer markdown.
 */
export function displayAskCitationLabels(
  content: string,
  sources: AskCitationDisplaySource[],
) {
  return sources.reduce((answer, source) => {
    const label = source.displayLabel ?? source.label;
    const display = source.href ? `[${label}](${source.href})` : `[${label}]`;
    return answer
      .replaceAll(`[${source.id}]`, display)
      .replaceAll(`[${source.label}]`, display);
  }, content);
}
