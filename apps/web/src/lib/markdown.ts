const TRAILING_SPACE_IN_STRONG = /\*\*([^\n*]*?\S)\s+\*\*/g;
const TRAILING_SPACE_IN_UNDERSCORE_STRONG = /__([^\n_]*?\S)\s+__/g;

/**
 * Repair a narrow class of malformed Markdown frequently produced by models.
 * CommonMark does not recognize closing emphasis when whitespace sits inside
 * the delimiter (`**Heading: **`), which otherwise exposes raw asterisks in UI.
 */
export function normalizeMarkdownForDisplay(value: string) {
  return value
    .replace(TRAILING_SPACE_IN_STRONG, "**$1** ")
    .replace(TRAILING_SPACE_IN_UNDERSCORE_STRONG, "__$1__ ");
}
