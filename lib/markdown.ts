/**
 * Markdown preprocessor.
 *
 * Fixes a common authoring issue where a list immediately follows a paragraph
 * with no blank line between them:
 *
 *   What that looks like:
 *   - Breakfast: 3 eggs
 *   - Lunch: chicken
 *
 * Per CommonMark, this SHOULD render as a paragraph followed by a list — but
 * remark-gfm sometimes treats the dashes as a continuation of the paragraph,
 * producing line-by-line text without bullets. The fix is to inject a blank
 * line before any list start that isn't already preceded by one.
 *
 * We're conservative — only insert a blank line if:
 *   1. The current line starts with a list marker (`- `, `* `, `+ `, or `1. `)
 *   2. The previous line is non-blank
 *   3. The previous line is NOT also a list item (don't break list continuity)
 *
 * Idempotent — running twice produces the same result.
 */

const LIST_MARKER = /^(\s*)([-*+]|\d+\.)\s+/;

export function preprocessMarkdown(input: string): string {
  if (!input) return input;
  const lines = input.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isListItem = LIST_MARKER.test(line);

    if (isListItem && i > 0) {
      const prev = lines[i - 1];
      const prevIsBlank = prev.trim() === '';
      const prevIsListItem = LIST_MARKER.test(prev);
      // Insert a blank line if previous line is non-blank AND not a list item
      if (!prevIsBlank && !prevIsListItem) {
        out.push('');
      }
    }
    out.push(line);
  }

  return out.join('\n');
}
