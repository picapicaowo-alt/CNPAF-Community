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
  const aliases = new Map<string, string>();
  for (const source of sources) {
    const label = source.displayLabel ?? source.label;
    const display = source.href ? `[${label}](${source.href})` : `[${label}]`;
    aliases.set(source.id.trim().toLocaleLowerCase(), display);
    aliases.set(source.label.trim().toLocaleLowerCase(), display);
  }

  return content.replace(
    /[\[〔【]([^\]〕】]+)[\]〕】]/g,
    (original, body: string) => {
      const tokens = body.split(/[;；]/).map((token) => token.trim()).filter(Boolean);
      if (!tokens.length) return original;
      const displays = tokens.map((token) => aliases.get(token.toLocaleLowerCase()));
      return displays.every((display): display is string => Boolean(display))
        ? displays.join("；")
        : original;
    },
  );
}
