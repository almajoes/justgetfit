import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import slugify from 'slugify';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are writing a fitness blog post for Just Get Fit at justgetfit.org.

BRAND VOICE:
- Editorial "we" voice (Just Get Fit Editorial), conversational, opinionated but humble
- Direct. Short sentences mixed with longer ones for rhythm.
- Skeptical of fitness industry hype. Evidence-based but not dry.
- Occasional dry humor. No exclamation points. No emoji.
- Write like a smart trainer who actually trains, not a content marketer.

CONTENT RULES:
- 800-1200 words
- Cite real research patterns (e.g. "studies on caffeine timing generally show...") but DO NOT fabricate specific study names, authors, journals, or statistics. If you don't know a specific number, say "research suggests" or "the literature points to" rather than inventing data.
- Practical takeaways the reader can use this week
- No fitness advice that could cause injury without nuance (heavy lifting, fasting, extreme protocols need caveats)
- Always recommend consulting a doctor/coach for medical issues, persistent pain, or significant program changes
- Never refer to AI assistance or that the article was AI-drafted

STRUCTURE:
- Hook in the first paragraph - a surprising claim, an anecdote, or a strong opinion
- Sub-headings (## level) to break up sections
- End with a clear "what to do this week" type takeaway

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "title": "string - punchy, max 70 chars, no clickbait",
  "excerpt": "string - 1-2 sentence summary, max 180 chars",
  "category": "string - one of: strength, hypertrophy, conditioning, nutrition, recovery, mobility, programming, mindset",
  "image_keywords": "string - 2-3 simple visual keywords for stock photo search (e.g. 'barbell deadlift gym', 'protein meal kitchen', 'runner trail morning'). Should be visually descriptive, not abstract.",
  "content": "string - the full post in Markdown. Start with the first paragraph (no H1). Use ## for sub-headings."
}`;

export type GeneratedDraft = {
  title: string;
  excerpt: string;
  category: string;
  imageKeywords: string;
  content: string;
  slug: string;
  model: string;
};

function readingMinutes(text: string) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 230));
}

export async function generateDraft(topic: {
  title: string;
  category: string;
  angle: string | null;
}): Promise<GeneratedDraft> {
  const userPrompt = `Topic: ${topic.title}
Category: ${topic.category}
${topic.angle ? `Angle: ${topic.angle}` : ''}

Write the post. Respond with the JSON object only - no markdown fences, no preamble.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in response');
  }

  const cleaned = textBlock.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let parsed: {
    title: string;
    excerpt: string;
    category: string;
    image_keywords: string;
    content: string;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse model output as JSON: ${(err as Error).message}`);
  }

  if (!parsed.title || !parsed.content) {
    throw new Error('Generated draft missing title or content');
  }

  const slug = slugify(parsed.title, { lower: true, strict: true }).slice(0, 80);

  return {
    title: parsed.title,
    excerpt: parsed.excerpt ?? '',
    category: parsed.category ?? topic.category,
    imageKeywords: parsed.image_keywords ?? topic.category,
    content: parsed.content,
    slug,
    model: MODEL,
  };
}

export { readingMinutes };

// =============================================================================
// TOPIC GENERATION
//
// Used by /api/admin/topics/generate (manual) and the weekly cron.
// Takes the 8 fitness categories + existing topic titles (to avoid duplicates)
// and asks Claude to come up with N fresh topic ideas.
// =============================================================================

const TOPIC_SYSTEM_PROMPT = `You are a fitness content strategist for Just Get Fit at justgetfit.org.

Your job is to generate fresh, original article topic ideas for an evidence-based fitness blog.

EDITORIAL VOICE:
- Skeptical of industry hype. Practical. Opinionated but humble.
- Topics should reward training-curious adults who already lift, run, or move
- Avoid clickbait, listicles, and supplement marketing tropes
- Avoid trendy buzzwords ("biohacking", "dopamine detox", "gut brain axis")
- Topics should be specific enough to write 800-1200 words on, not vague ("Strength training tips")

EVERY TOPIC MUST INCLUDE:
- A clear, punchy title (max 70 chars)
- A category from this exact list: strength, hypertrophy, conditioning, nutrition, recovery, mobility, programming, mindset
- A short "angle" (1-2 sentences explaining the unique take or what the article will argue)

DIVERSITY:
- Spread topics across all 8 categories (don't put 5 strength topics in one batch)
- Mix evergreen topics with timely takes
- Mix beginner-relevant and advanced-relevant

OUTPUT FORMAT (strict JSON array, no markdown fences):
[
  {
    "title": "string",
    "category": "strength" | "hypertrophy" | "conditioning" | "nutrition" | "recovery" | "mobility" | "programming" | "mindset",
    "angle": "string"
  },
  ...
]`;

export type GeneratedTopic = {
  title: string;
  category: string;
  angle: string;
};

const VALID_CATEGORIES = ['strength', 'hypertrophy', 'conditioning', 'nutrition', 'recovery', 'mobility', 'programming', 'mindset'];

export async function generateTopics(opts: {
  count: number;
  existingTitles?: string[];
}): Promise<GeneratedTopic[]> {
  const count = Math.max(1, Math.min(50, opts.count));
  const existing = (opts.existingTitles || []).slice(0, 200); // cap at 200 for prompt size

  const userPrompt = `Generate ${count} fresh, original article topics for Just Get Fit.

${existing.length > 0
  ? `EXISTING TOPICS (do NOT duplicate or closely paraphrase these):\n${existing.map((t) => `- ${t}`).join('\n')}\n`
  : 'This is the first batch — no existing topics to avoid.'}

Return a JSON array with ${count} topic objects. Spread topics evenly across the 8 categories. Each topic should be specific enough to write a focused 800-1200 word article on.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: TOPIC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in topic generator response');
  }

  // Strip code fences if Claude added them
  const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse topic generator output as JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Topic generator did not return a JSON array');
  }

  const topics: GeneratedTopic[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const category = typeof r.category === 'string' ? r.category.trim().toLowerCase() : '';
    const angle = typeof r.angle === 'string' ? r.angle.trim() : '';
    if (!title || !VALID_CATEGORIES.includes(category)) continue;
    topics.push({ title, category, angle });
  }

  if (topics.length === 0) {
    throw new Error('Topic generator returned no valid topics');
  }

  return topics;
}
