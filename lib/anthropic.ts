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
