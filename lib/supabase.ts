import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// =====================================================
// CORE TYPES
// =====================================================
export type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  cover_image_url: string | null;
  cover_image_credit: string | null;
  read_minutes: number | null;
  published_at: string;
  updated_at: string;
  // Authors + bylines (May 2026):
  // author_id points to the public.authors row that bylines this post;
  // editor_credit is the "Edited by ..." line that always reads "Just Get
  // Fit Editorial" by default. Both nullable for back-compat with rows
  // that pre-date the migration; new rows always carry both.
  author_id?: string | null;
  editor_credit?: string | null;
  // Citations (May 2026): array of source entries that the inline [N]
  // markers in `content` reference. Null = no citations on this post.
  sources?: Source[] | null;
  // Rejected sources from the last citation run — kept around so the
  // Sources admin page can show them with their rejection reason and
  // the admin can manually approve borderline cases.
  rejected_sources?: RejectedSource[] | null;
};

export type Draft = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  cover_image_url: string | null;
  cover_image_credit: string | null;
  topic_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  generation_model: string | null;
  generation_notes: string | null;
  created_at: string;
  updated_at: string;
  // See Post type for the authors/byline contract — same shape on drafts
  // so the assignment survives the draft → publish copy step.
  author_id?: string | null;
  editor_credit?: string | null;
  sources?: Source[] | null;
  rejected_sources?: RejectedSource[] | null;
};

/**
 * A single citation. The body of a post carries inline `[N]` markers
 * where N matches the `n` field here. Quote is null for source-only
 * citations, populated for direct-quote ones — the prompt to Claude
 * asks for whichever fits the claim better.
 */
export type Source = {
  n: number;
  title: string;
  url: string;
  publication: string | null;
  quote: string | null;
  accessed_at: string; // ISO
};

/**
 * A source Claude proposed but verification rejected. Stored on the
 * post for review on /admin/sources so admins can manually approve
 * borderline cases. No `n` because it's not anchored to anything until
 * approved.
 */
export type RejectedSource = {
  title: string;
  url: string;
  publication: string | null;
  quote: string | null;
  reason: string; // why it failed verification, e.g. "HTTP 404"
};

export type Author = {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  photo_credit: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Topic = {
  id: string;
  title: string;
  category: string;
  angle: string | null;
  used_at: string | null;
  created_at: string;
};

export type Category = {
  slug: string;
  name: string;
  icon: string | null;
  position: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type Partner = {
  id: string;
  name: string;
  blurb: string;
  url: string;
  tag: string | null;
  image_url: string | null;
  image_gradient: string | null;
  initials: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type NavItem = {
  id: string;
  location: 'main_nav' | 'footer_quick_links' | 'footer_categories';
  label: string;
  url: string;
  is_cta: boolean;
  new_tab: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Subscriber = {
  id: string;
  email: string;
  status: 'pending' | 'confirmed' | 'unsubscribed' | 'bounced';
  confirmation_token: string;
  unsubscribe_token: string;
  source: string | null;
  subscribed_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  last_sent_at: string | null;
};

export type NewsletterSend = {
  id: string;
  post_id: string | null;
  kind: 'post' | 'broadcast';
  subject: string | null;
  body_markdown: string | null;
  sent_at: string;
  recipient_count: number;
  failed_count: number;
  status: 'pending' | 'sending' | 'completed' | 'failed';
  notes: string | null;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

// =====================================================
// SETTINGS TYPES (key-value JSONB)
// =====================================================
export type SiteSettings = {
  name: string;
  tagline: string;
  description: string;
  contact_email: string;
  newsletter_enabled: boolean;
  // SEO overrides (all optional — empty/missing values fall back to sensible defaults)
  seo_title?: string;            // overrides home page <title>; falls back to "${name} — ${tagline}"
  seo_title_template?: string;   // template for sub-page titles. Use %s as placeholder. Default: "%s · ${name}"
  seo_description?: string;      // overrides meta description; falls back to `description`
  keywords?: string;             // comma-separated list for <meta name="keywords">
  og_title?: string;             // Open Graph title (social shares); falls back to seo_title or name+tagline
  og_description?: string;       // Open Graph description; falls back to seo_description or description
};

export type FooterSettings = {
  brand_tagline: string;
  copyright: string;
  version_label: string;
};

// =====================================================
// PAGE CONTENT TYPES (JSONB pages.content)
// =====================================================
export type CTA = { label: string; url: string };

export type HomeHeroPage = {
  pill_text: string;
  headline_part1: string;
  headline_accent: string;
  headline_part2: string;
  lede: string;
  cta_primary: CTA;
  cta_secondary: CTA;
  background_image_url: string;
  stats: { num: string; suffix: string; label: string }[];
};

export type AboutPage = {
  pill_text: string;
  headline_part1: string;
  headline_accent: string;
  headline_part2: string;
  tagline: string;
  body_markdown: string;
  pillars: { num: string; title: string; desc: string }[];
  cta_primary: CTA;
  cta_secondary: CTA;
};

export type SubscribePage = {
  pill_text: string;
  headline_part1: string;
  headline_accent: string;
  headline_part2: string;
  lede: string;
  form_placeholder: string;
  form_button: string;
  promise_heading: string;
  promises: { icon: string; title: string; desc: string }[];
  faq_heading: string;
  faqs: { q: string; a: string }[];
};

export type ContactPage = {
  pill_text: string;
  headline_part1: string;
  headline_accent: string;
  headline_part2: string;
  intro: string;
  labels: { name: string; email: string; subject: string; message: string; submit: string };
  placeholders: { name: string; email: string; subject: string; message: string };
  success_message: string;
};

export type AppPage = {
  // ─── Hero / CTA card (used at the end of every article) ───
  // The same component (components/AppCTA.tsx) renders article-end inline
  // CTAs and supports a hero variant for future reuse. Some fields differ
  // per variant (subhead, primary button label, secondary link); others
  // are shared (eyebrow, headline, feature cards, primary button URL).
  cta_eyebrow: string;
  cta_headline: string;
  cta_subhead_inline: string;
  cta_subhead_hero: string;
  cta_features: { icon: string; title: string; desc: string }[];
  cta_primary_url: string;
  cta_primary_label_inline: string;
  cta_primary_label_hero: string;
  // Secondary links — different copy/destinations per variant
  cta_secondary_label_inline: string;
  cta_secondary_href_inline: string;
  cta_secondary_label_hero: string;
  cta_secondary_href_hero: string;

  // App-launch toggle. While false (private beta), the AppCTA primary
  // button renders as a non-interactive "Coming soon" pill regardless of
  // CMS values, and the hero variant secondary link force-overrides to
  // "Subscribe to reserve your spot" → /subscribe. Flip to true once the
  // app at app.justgetfit.org is publicly live.
  app_live?: boolean;

  // Optional YouTube video embedded at the very top of the /app page.
  // Accepts any youtube.com/youtu.be/shorts/embed URL — the page extracts
  // the video ID at render time. Leave empty to hide.
  hero_video_url?: string;

  // The /app page is rendered as a single-column editorial document from
  // a single Markdown blob. Supports headings (#, ##, ###), paragraphs,
  // bullet lists (-, *), numbered lists, bold, italic, and links. Nested
  // bullets are intentionally flattened to a single level by the renderer
  // — the editorial design only allows single-level lists.
  page_markdown?: string;
};

export type PageSlug = 'home-hero' | 'about' | 'subscribe' | 'contact' | 'app';
export type PageContent = HomeHeroPage | AboutPage | SubscribePage | ContactPage | AppPage;
