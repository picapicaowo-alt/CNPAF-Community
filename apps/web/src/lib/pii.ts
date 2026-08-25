import type { Attribution, SourceKind, SourceKindPolicy } from "@cnpaf/shared";

export type PiiHit = {
  kind: string;
  excerpt: string;
  start: number;
  end: number;
};

export type PrivacyScanResult = {
  status: "clear" | "redacted" | "flagged";
  hits: PiiHit[];
  redactedText: string;
};

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "phone", re: /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?!\d)/g },
  { kind: "cn_phone", re: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  { kind: "cn_id", re: /(?<!\d)\d{17}[\dXx](?!\d)/g },
  { kind: "ssn", re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g },
  { kind: "name_intro", re: /(?:我叫|名叫|他叫|她叫|名为|name is|named)\s*[\u4e00-\u9fffA-Za-z]{1,8}/gi },
  { kind: "honorific", re: /(?:Mr\.|Mrs\.|Ms\.|Miss)\s+[A-Z][a-z]+/g },
];

function collectHits(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  for (const { kind, re } of PATTERNS) {
    const copy = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = copy.exec(text))) {
      hits.push({
        kind,
        excerpt: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return hits;
}

function applyRedactions(text: string, hits: PiiHit[]): string {
  const sorted = [...hits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const hit of sorted) {
    out = `${out.slice(0, hit.start)}[redacted:${hit.kind}]${out.slice(hit.end)}`;
  }
  return out;
}

/**
 * Policy-aware scan. Never send unsanitized field text to an external model.
 * Only attribution identifiers explicitly allowed by the active source policy
 * are exempted from the qualitative-text scan.
 */
export function scanPrivacy(input: {
  sourceKind: SourceKind | string;
  qualitative: string;
  attribution: Attribution;
  policy?: Pick<SourceKindPolicy, "allowedIdentifierFields" | "privacyDisposition">;
}): PrivacyScanResult {
  const allowed = new Set(
    (input.policy?.allowedIdentifierFields ?? [])
      .map((field) => String(input.attribution[field] ?? "").trim())
      .filter(Boolean)
      .map((v) => v.toLowerCase()),
  );

  const hits = collectHits(input.qualitative).filter((hit) => {
    if (allowed.has(hit.excerpt.trim().toLowerCase())) return false;
    if (input.policy?.privacyDisposition === "redact" && (hit.kind === "honorific" || hit.kind === "name_intro")) {
      const looksLikeResident = /住户|老人|参与者|病人|resident|participant/i.test(input.qualitative);
      return looksLikeResident;
    }
    return true;
  });

  if (hits.length === 0) {
    return { status: "clear", hits: [], redactedText: input.qualitative };
  }

  if ((input.policy?.privacyDisposition ?? "flag") === "flag") {
    return {
      status: "flagged",
      hits,
      redactedText: applyRedactions(input.qualitative, hits),
    };
  }

  return {
    status: "redacted",
    hits,
    redactedText: applyRedactions(input.qualitative, hits),
  };
}
