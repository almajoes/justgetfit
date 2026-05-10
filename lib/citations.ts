import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { Post, Source, RejectedSource } from '@/lib/supabase';

/**
 * Citation generation for existing articles.
 *
 * Given an already-written article (post.content), use Claude with the
 * web_search tool to find real sources that back up factual claims in
 * the prose, and return a verified source list. The article body is
 * NEVER modified — sources appear as a "References" / "Sources"
 * section at the bottom of the rendered article, not anchored to
 * specific claims with inline markers.
 *
 * Key design decisions:
 *   1. Sources only. No inline [N] markers, no prose rewriting. The
 *      body the admin authored is preserved exactly. Sources render as
 *      a numbered list at the bottom of the article, like a "Further
 *      reading" section.
 *
 *   2. Tool-call output, not JSON-in-text. Claude is required to deliver
 *      its final result by calling the `submit_citations` client tool
 *      (defined below). The SDK validates against the input_schema, and
 *      we read the structured payload directly off the tool_use block.
 *      This sidesteps the failure mode where Claude writes planning
 *      prose ("Let me analyze the claims...") instead of the JSON we
 *      asked for. The tool definition is the contract.
 *
 *   3. Verify after generate. After Claude returns sources, we fetch
 *      each URL server-side and check (a) HTTP 200 and (b) the page
 *      title roughly matches what Claude said it was. Sources that fail
 *      either check are moved to rejected_sources for admin review on
 *      /admin/sources, where they can be manually approved.
 *
 *   4. Fail open. If verification rejects all sources (or web_search
 *      returns nothing), sources stays []. The article is publishable
 *      either way — the body never changed.
 *
 *   5. Cost control. max_uses=8 caps web_search calls per article at $0.08
 *      tool fee + token costs. Realistic per-article: $0.20-0.30.
 *
 * Web search docs: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 */

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = 'claude-sonnet-4-5';
const MAX_WEB_SEARCHES = 8;

const CITATION_SYSTEM_PROMPT = `You are adding a "References" list to an existing fitness article on justgetfit.org.

YOUR JOB:
You receive a finished article body in Markdown. Your job is to identify factual claims that benefit from a real-source citation, use the web_search tool to find HIGH-QUALITY real sources, and finally call the submit_citations tool with the structured source list.

The article body itself is NEVER modified. You produce a list of references that will appear at the bottom of the article — like the "Sources" section in a magazine article. No inline markers in the prose, no rewrites, no edits to the body. Just a curated list of references that back up claims in the article.

PROCESS:
1. Read the article and identify 3-8 factual claims that warrant citation.
2. For each claim, use web_search to find a real, high-quality source.
3. Call submit_citations with the source list.
4. DO NOT write any prose response, planning notes, or commentary outside of tool calls. Your work is: search → submit_citations. Nothing else.

WHAT TO CITE:
- Specific statistics or numbers ("studies show 30% improvement", "lifters who train 3x/week")
- Study references ("research from the Journal of Strength...")
- Expert positions or quotes from named authorities
- Specific protocols or methodologies attributed to research
- Health claims that affect reader behavior (medication, supplements, injury)
- Common claims that turn out to have nuance or counter-evidence in the literature

WHAT NOT TO CITE:
- Author opinions ("we think", "in our view", "feels like")
- Common-knowledge facts ("muscles need rest to grow")
- Practical "what to do" sections
- Anecdotes or hypotheticals
- Brand voice statements

SOURCE QUALITY (in order of preference):
1. Peer-reviewed research (PubMed, Cochrane, journal sites)
2. Major textbook references or established health authorities (NIH, CDC, AHA, WHO, NHS, Mayo Clinic)
3. Reputable journalism with named expert sources (NYTimes, Guardian, Atlantic, scientific journalism)
4. Established sport-science publications (Stronger By Science, Examine.com, Outside Online)

AVOID:
- Random blog posts or content marketing
- Affiliate review sites
- Forum threads (Reddit, Quora)
- Listicle aggregators
- Wikipedia (not a primary source — go to Wikipedia's references instead)

OPTIONAL DIRECT QUOTES:
For each source, you may optionally include a SHORT verbatim excerpt (under 20 words) in the quote field. This shows up below the source title at the bottom of the article. Use sparingly — only when the source's exact wording adds something a paraphrase couldn't. Most sources should have quote: null.

CRITICAL RULES:
1. DO NOT INVENT CITATIONS. Every source must be a real URL you found via web_search.
2. DO NOT FABRICATE STATS OR STUDIES. Only cite what the source actually says.
3. SHORT QUOTES ONLY. Optional direct quotes must be under 20 words and properly attributed.
4. AIM FOR 3-8 CITATIONS per article.
5. NUMBERS ARE SEQUENTIAL. n: 1, 2, 3, ... in the order you list them.

If after searching you can't find any usable sources, call submit_citations with an empty sources array. That's a valid outcome.`;

/**
 * The submit_citations client tool. Claude calls this once at the end
 * with the structured citations payload — bypassing the JSON-parsing
 * problems we hit when asking for JSON in a text block (the model would
 * sometimes write planning prose instead).
 *
 * Defining this with a strict input_schema means the SDK validates
 * Claude's tool call against the schema before delivering it to us, so
 * we get type-safe data without manually parsing JSON.
 */
const SUBMIT_CITATIONS_TOOL = {
  name: 'submit_citations',
  description:
    'Submit the final list of references for the article. Call this exactly once after gathering sources via web_search.',
  input_schema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description:
          'The references for the article, in order. Each is a real source found via web_search that supports a factual claim in the article. Empty array if no usable sources were found.',
        items: {
          type: 'object',
          properties: {
            n: {
              type: 'integer',
              description:
                'Sequential reference number starting at 1 (1, 2, 3, ...). Used as a stable identifier in the references list.',
              minimum: 1,
            },
            title: {
              type: 'string',
              description: 'Exact title of the source page or paper.',
            },
            url: {
              type: 'string',
              description: 'Full URL of the source. Must be a real URL found via web_search.',
            },
            publication: {
              type: ['string', 'null'],
              description:
                "Publication or organization name (e.g. 'PubMed', 'NYTimes', 'Mayo Clinic'). Null if unclear.",
            },
            quote: {
              type: ['string', 'null'],
              description:
                'Optional short verbatim excerpt under 20 words. Null for most sources; only include when the exact wording adds something a paraphrase could not.',
            },
          },
          required: ['n', 'title', 'url'],
        },
      },
    },
    required: ['sources'],
  },
} as const;

/**
 * The shape Claude returns via the submit_citations tool. Validated
 * before we trust it. The body is never modified — sources only.
 */
type CitationsResponse = {
  sources: Array<{
    n: number;
    title: string;
    url: string;
    publication: string | null;
    quote: string | null;
  }>;
};

/**
 * Result of running citations on a post.
 *
 * - ok: true with sources populated — happy path, store these
 * - ok: true with sources=[] — Claude couldn't find good sources.
 *   Caller should treat as "no citations available."
 * - ok: false — actual error (API failure, parse failure, etc.). Caller
 *   should NOT update the post; surface error to admin.
 *
 * Note: the article body is never modified by this pipeline. Sources
 * are stored on posts.sources only; the body stays exactly as the
 * admin authored it.
 */
export type AddCitationsResult =
  | {
      ok: true;
      sources: Source[];
      rejectedSources: RejectedSource[];
      stats: {
        proposed: number; // how many sources Claude proposed
        verified: number; // how many passed verification
        rejected: number; // proposed - verified
      };
    }
  | { ok: false; error: string };

export async function addCitationsToPost(post: Pick<Post, 'id' | 'title' | 'category' | 'content'>): Promise<AddCitationsResult> {
  const tStart = Date.now();
  const log = (msg: string) => console.log(`[addCitations ${post.id?.slice(0, 8) ?? '?'}] +${Date.now() - tStart}ms ${msg}`);
  log(`starting (content length=${post.content.length})`);

  const userPrompt = `ARTICLE TITLE: ${post.title}
CATEGORY: ${post.category ?? 'general'}

ARTICLE BODY:
${post.content}

Search the web for sources, then call the submit_citations tool with the result.`;

  let response: Anthropic.Message;
  try {
    log('calling Anthropic API with web_search + submit_citations tools');
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192, // big enough to fit a 1200-word article + sources payload
      system: CITATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: MAX_WEB_SEARCHES,
        } as unknown as Anthropic.Tool, // SDK type doesn't yet include the server-tool variant
        SUBMIT_CITATIONS_TOOL as unknown as Anthropic.Tool,
      ],
    });
    log(`API call returned (stop_reason=${response.stop_reason}, ${response.content.length} content blocks)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Anthropic API call failed';
    console.error(`[addCitations ${post.id?.slice(0, 8)}] API call failed:`, msg);
    return { ok: false, error: msg };
  }

  // We expect the model to end its turn by calling submit_citations.
  // Find that tool_use block and read its input — that's our structured
  // payload, no JSON parsing needed.
  const submitCall = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_citations'
  );
  if (!submitCall) {
    // Diagnostic: log what we DID get back so we can iterate on the prompt.
    const blockTypes = response.content.map((b) => b.type).join(',');
    const textPreview =
      (response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined)?.text.slice(0, 300) ?? '(no text block)';
    log(`submit_citations NOT called. blocks=[${blockTypes}], stop_reason=${response.stop_reason}, text preview="${textPreview}"`);
    return {
      ok: false,
      error: `Model didn't call submit_citations (stop_reason=${response.stop_reason}). Text preview: ${textPreview.slice(0, 200)}`,
    };
  }
  log('submit_citations call found — reading structured input');

  const parsed = submitCall.input as CitationsResponse;

  // Shape validation
  if (!Array.isArray(parsed.sources)) {
    log('sources missing or wrong type');
    return { ok: false, error: 'Response missing sources array' };
  }

  // Empty sources is a valid "I couldn't find good citations" outcome.
  if (parsed.sources.length === 0) {
    log('Claude returned 0 sources');
    return {
      ok: true,
      sources: [],
      rejectedSources: [],
      stats: { proposed: 0, verified: 0, rejected: 0 },
    };
  }

  const proposed = parsed.sources.length;
  log(`verifying ${proposed} proposed sources`);

  // Per-source verification: HTTP 200 + title roughly matches what
  // Claude claimed. Run in parallel since they're independent fetches.
  const verifications = await Promise.all(
    parsed.sources.map((s) => verifySource(s))
  );
  const verifiedSources: Source[] = [];
  const rejectedSources: RejectedSource[] = []; // for admin review

  const accessedAt = new Date().toISOString();
  for (let i = 0; i < parsed.sources.length; i++) {
    const proposed = parsed.sources[i];
    const result = verifications[i];
    if (result.ok) {
      verifiedSources.push({
        n: proposed.n,
        title: proposed.title,
        url: proposed.url,
        publication: proposed.publication ?? null,
        quote: proposed.quote ?? null,
        accessed_at: accessedAt,
      });
    } else {
      console.warn(`[addCitations] Source rejected: ${proposed.url} — ${result.reason}`);
      // Keep the rejected source for admin review on /admin/sources.
      // Reason text is what verifySource() returned — admin can read it
      // and decide whether to manually approve.
      rejectedSources.push({
        title: proposed.title,
        url: proposed.url,
        publication: proposed.publication ?? null,
        quote: proposed.quote ?? null,
        reason: result.reason,
      });
    }
  }

  if (verifiedSources.length === 0) {
    // Every proposed source failed verification. Return the rejected
    // list so the admin can review them on /admin/sources.
    return {
      ok: true,
      sources: [],
      rejectedSources,
      stats: { proposed, verified: 0, rejected: proposed },
    };
  }

  // Renumber sources sequentially 1..K. Claude was asked to produce
  // 1..N in order; if any got rejected there'd be gaps. Resequencing
  // produces a clean numbered list for display.
  const renumberedSources = verifiedSources.map((s, i) => ({ ...s, n: i + 1 }));

  return {
    ok: true,
    sources: renumberedSources,
    rejectedSources,
    stats: {
      proposed,
      verified: renumberedSources.length,
      rejected: proposed - renumberedSources.length,
    },
  };
}

/**
 * Verify a proposed citation: fetch the URL, check status, check that
 * the page <title> roughly matches what Claude claimed.
 *
 * Loose match: lowercase both, strip punctuation, check that ≥40% of
 * the words from Claude's claimed title (length ≥ 4 chars, not stopwords)
 * appear in the fetched page title. This catches:
 *   - URL doesn't exist (404)
 *   - URL exists but is a paywall / login page (title doesn't match)
 *   - Claude hallucinated a slightly-wrong URL pointing at a real page
 *     about a different topic
 * Allows:
 *   - Real source where the title differs in capitalization, ordering,
 *     or by some words (publications often append site name etc).
 */
async function verifySource(s: { url: string; title: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  // URL sanity. Reject anything that won't even parse.
  let url: URL;
  try {
    url = new URL(s.url);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'unsupported protocol' };
  }

  // Fetch with a 6s timeout. Use a real-looking User-Agent so we're not
  // blocked by bot detection on legit sites. Don't follow infinite
  // redirect chains (fetch caps at 20 by default, fine).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        // Mimic a normal browser. Some publications block default fetch UA.
        'User-Agent':
          'Mozilla/5.0 (compatible; JustGetFitBot/1.0; +https://justgetfit.org)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return { ok: false, reason: `fetch error: ${msg}` };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}` };
  }

  // Read the body, but cap at 500KB so we don't gobble huge pages just
  // to find the <title>. Title is in the <head>, well within 500KB.
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, reason: 'no response body' };
  const chunks: Uint8Array[] = [];
  let total = 0;
  const MAX = 500 * 1024;
  try {
    while (total < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch (err) {
    return { ok: false, reason: 'body read error' };
  } finally {
    try {
      reader.cancel();
    } catch {
      /* ignore */
    }
  }
  const html = new TextDecoder('utf-8', { fatal: false }).decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c)))
  );

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return { ok: false, reason: 'no <title> in HTML' };
  const fetchedTitle = decodeHtmlEntities(titleMatch[1]).trim();
  if (!fetchedTitle) return { ok: false, reason: 'empty <title>' };

  // Loose title match.
  const claimWords = significantWords(s.title);
  const fetchedWords = new Set(significantWords(fetchedTitle));
  if (claimWords.length === 0) {
    // Claude returned a 0-significant-word title? Skip the check.
    return { ok: true };
  }
  const overlap = claimWords.filter((w) => fetchedWords.has(w)).length;
  const ratio = overlap / claimWords.length;
  if (ratio < 0.4) {
    return {
      ok: false,
      reason: `title mismatch (${overlap}/${claimWords.length} = ${ratio.toFixed(2)}; claimed "${s.title.slice(0, 60)}", fetched "${fetchedTitle.slice(0, 60)}")`,
    };
  }
  return { ok: true };
}

/**
 * Tokenize a title into significant words: lowercase, strip punctuation,
 * drop short words and English stopwords. Used by verifySource() for
 * loose matching.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'her', 'his', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'this', 'these', 'those', 'but',
]);
function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
