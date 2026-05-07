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
  // ─── Hero / CTA card (shared between /app top hero and article-end CTA) ───
  // The same component renders in two variants; some fields differ per variant
  // (subhead, primary button label, secondary link) while others are shared
  // (eyebrow, headline, feature cards, primary button URL).
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

  // Optional YouTube video embedded between the hero and the "How it works"
  // section. Accepts any youtube.com/youtu.be/shorts/embed URL — the page
  // extracts the video ID at render time. Leave empty to hide the section.
  hero_video_url?: string;

  // The "How it works" section
  how_it_works_eyebrow: string;
  how_it_works_heading: string;
  steps: { title: string; desc: string; cta_label?: string; cta_href?: string }[];

  // The "What you get" section
  features_eyebrow: string;
  features_heading: string;
  // Legacy flat feature list (kept for backwards compatibility — earlier
  // versions of /app rendered just these as single-line cards). Newer
  // designs prefer `feature_groups` below, which supports a card with a
  // headline/description plus a clean (single-level) bullet list of
  // capabilities. If `feature_groups` has any items, the page renders
  // those instead of `features`.
  features: { icon: string; title: string; desc: string }[];
  // Richer feature blocks: each is a card with icon/title/short description
  // and a flat list of bullet items underneath. NEVER nest bullets — the
  // page renders `items` as a single-level list. If you need a sub-group,
  // create a separate feature_group entry.
  feature_groups?: {
    icon: string;
    title: string;
    desc: string;
    items: string[];
  }[];

  // Closing "philosophy" block — appears after the features grid. Used to
  // ground the feature list in a design ethos (e.g. "designed around
  // sustainability"). Optional — page hides the section if heading is empty.
  philosophy_eyebrow?: string;
  philosophy_heading?: string;
  philosophy_body?: string;
  philosophy_avoid?: string[];   // "We avoid…" bullet list
  philosophy_focus?: string[];   // "We focus on…" bullet list

  // FAQ section
  faq_eyebrow: string;
  faq_heading: string;
  faqs: { q: string; a: string }[];

  // Bottom CTA section
  bottom_cta_heading: string;
  bottom_cta_subhead: string;
  bottom_cta_primary_label: string;
  bottom_cta_primary_href: string;
  bottom_cta_secondary_label: string;
  bottom_cta_secondary_href: string;

  // ─── Doc-style page content (May 2026 redesign) ─────────────────────
  // The /app page is now a single-column editorial document — page title,
  // intro paragraph, then a flat sequence of sections. Each section can
  // optionally include subsections, each with their own intro paragraph
  // and a flat (single-level only) bullet list. The CTA fields above are
  // still used by the AppCTA component on article pages, but the /app
  // page itself ignores them in favor of this structure.
  page_title?: string;
  page_intro?: string;
  doc_sections?: {
    title: string;
    intro?: string;
    subsections?: {
      title?: string;
      intro?: string;
      items?: string[];
    }[];
  }[];
};

export type PageSlug = 'home-hero' | 'about' | 'subscribe' | 'contact' | 'app';
export type PageContent = HomeHeroPage | AboutPage | SubscribePage | ContactPage | AppPage;
