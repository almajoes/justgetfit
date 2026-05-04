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
  // The "How it works" section
  how_it_works_eyebrow: string;
  how_it_works_heading: string;
  steps: { title: string; desc: string; cta_label?: string; cta_href?: string }[];

  // The "What you get" section
  features_eyebrow: string;
  features_heading: string;
  features: { icon: string; title: string; desc: string }[];

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
};

export type PageSlug = 'home-hero' | 'about' | 'subscribe' | 'contact' | 'app';
export type PageContent = HomeHeroPage | AboutPage | SubscribePage | ContactPage | AppPage;
