/**
 * Markdown preprocessor.
 *
 * Two passes:
 *
 * 1) List-spacing fix. CommonMark says a list immediately following a
 *    paragraph (no blank line) should still render as a list. remark-gfm
 *    sometimes flattens it. We insert a blank line before a list start
 *    when the previous line is non-blank and not itself a list item.
 *
 * 2) Citation markers (May 2026). Body content can carry `[N]` markers
 *    where N references a sources entry. We rewrite each marker into a
 *    proper markdown link: `[N]` → `[\[N\]](#source-N)`. The escaped
 *    brackets `\[N\]` are the link's display text, so the rendered HTML
 *    looks like `<a href="#source-1">[1]</a>` — clickable anchor that
 *    jumps to the matching source entry at the bottom of the article.
 *
 *    We skip markers that look like markdown links already (e.g. inside
 *    a `[label](url)` construct where the label is just `[1]`) — that's
 *    extremely unlikely but cheap to guard against.
 *
 * Idempotent — running twice produces the same result.
 */

const LIST_MARKER = /^(\s*)([-*+]|\d+\.)\s+/;

export function preprocessMarkdown(input: string): string {
  if (!input) return input;

  // Pass 1: list spacing
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
  let result = out.join('\n');

  // Pass 2: citation markers → anchor links. Match `[N]` where N is a
  // 1-3 digit integer. Lookbehind avoids rewriting markers that are
  // already inside a markdown link's display text — e.g. `[\[1\]](...)`
  // shouldn't get nested. Also avoid markers immediately followed by `(`
  // (already a markdown link). Idempotent because the rewrite produces
  // `[\[N\]](#source-N)` which contains escaped brackets the regex
  // doesn't match again.
  result = result.replace(
    /(?<!\\)\[(\d{1,3})\](?!\()/g,
    (_full, n: string) => `[\\[${n}\\]](#source-${n})`
  );

  return result;
}
