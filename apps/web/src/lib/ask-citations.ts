import { askAiOutputSchema } from "@cnpaf/shared";

type AskCitationSource = { id: string; label: string };

function citationToken(value: string) {
  return value.trim().replace(/^\[|\]$/g, "").toLocaleLowerCase();
}

/**
 * OpenAI structured output guarantees a string here, but a model can still
 * choose the human-facing AF label instead of the supplied UUID. Resolve only
 * exact aliases from the authorized retrieval set; unknown citations remain
 * invalid and are rejected by the shared UUID schema.
 */
export function normalizeAskAiOutput(output: unknown, sources: AskCitationSource[]) {
  const aliases = new Map<string, string>();
  for (const source of sources) {
    aliases.set(citationToken(source.id), source.id);
    aliases.set(citationToken(source.label), source.id);
  }
  if (!output || typeof output !== "object") return askAiOutputSchema.parse(output);
  const raw = output as { citations?: unknown };
  const citations = Array.isArray(raw.citations)
    ? raw.citations.map((citation) => {
        if (!citation || typeof citation !== "object") return citation;
        const item = citation as { sourceId?: unknown };
        if (typeof item.sourceId !== "string") return citation;
        return { ...item, sourceId: aliases.get(citationToken(item.sourceId)) ?? item.sourceId };
      })
    : raw.citations;
  return askAiOutputSchema.parse({ ...output, citations });
}
