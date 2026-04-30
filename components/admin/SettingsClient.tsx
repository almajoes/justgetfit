'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings, FooterSettings } from '@/lib/supabase';

export function SettingsClient({ site, footer }: { site: SiteSettings; footer: FooterSettings }) {
  const router = useRouter();
  const [siteVal, setSiteVal] = useState<SiteSettings>(site);
  const [footerVal, setFooterVal] = useState<FooterSettings>(footer);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: siteVal, footer: footerVal }),
    });
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString());
    router.refresh();
  }

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Site settings</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {savedAt && <span style={{ color: 'var(--neon)', fontSize: 13 }}>Saved {savedAt}</span>}
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '10px 22px', fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Site</h2>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 24, marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Site name</label>
          <input className="input" value={siteVal.name} onChange={(e) => setSiteVal({ ...siteVal, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Tagline</label>
          <input className="input" value={siteVal.tagline} onChange={(e) => setSiteVal({ ...siteVal, tagline: e.target.value })} />
        </div>
        <div>
          <label className="label">Site description</label>
          <textarea className="input" rows={2} value={siteVal.description} onChange={(e) => setSiteVal({ ...siteVal, description: e.target.value })} />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Used as the default meta description and OG description if the SEO overrides below are empty.
          </p>
        </div>
        <div>
          <label className="label">Contact email (where contact form messages go)</label>
          <input className="input" type="email" value={siteVal.contact_email} onChange={(e) => setSiteVal({ ...siteVal, contact_email: e.target.value })} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={siteVal.newsletter_enabled}
            onChange={(e) => setSiteVal({ ...siteVal, newsletter_enabled: e.target.checked })}
          />
          Newsletter signups enabled
        </label>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>SEO &amp; social</h2>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 24, marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="text-xs" style={{ color: 'var(--text-3)', marginTop: 0, marginBottom: 4, lineHeight: 1.6 }}>
          These override the defaults computed from your site name, tagline, and description above.
          Leave any field empty to use the computed default.
        </p>
        <div>
          <label className="label">SEO title (homepage)</label>
          <input
            className="input"
            value={siteVal.seo_title || ''}
            onChange={(e) => setSiteVal({ ...siteVal, seo_title: e.target.value })}
            placeholder={`${siteVal.name} — ${siteVal.tagline}`}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            What appears in the browser tab and Google search result for the homepage. Aim for under 60 characters. Sub-pages use the title template below.
          </p>
        </div>
        <div>
          <label className="label">Sub-page title template</label>
          <input
            className="input"
            value={siteVal.seo_title_template || ''}
            onChange={(e) => setSiteVal({ ...siteVal, seo_title_template: e.target.value })}
            placeholder={`%s | ${siteVal.name}: Practical Fitness, Smarter Training & Real Results`}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Format for every sub-page&apos;s <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>&lt;title&gt;</code> tag. Use <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>%s</code> as the placeholder for the page&apos;s own title.
            Example: &ldquo;About&rdquo; renders as &ldquo;About | {siteVal.name}: Practical Fitness, Smarter Training &amp; Real Results&rdquo;.
          </p>
        </div>
        <div>
          <label className="label">Meta description</label>
          <textarea
            className="input"
            rows={2}
            value={siteVal.seo_description || ''}
            onChange={(e) => setSiteVal({ ...siteVal, seo_description: e.target.value })}
            placeholder={siteVal.description}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            The snippet under your title in Google search results. Aim for 140&ndash;160 characters.
          </p>
        </div>
        <div>
          <label className="label">Meta keywords</label>
          <input
            className="input"
            value={siteVal.keywords || ''}
            onChange={(e) => setSiteVal({ ...siteVal, keywords: e.target.value })}
            placeholder="fitness, strength training, hypertrophy, nutrition"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Comma-separated. Modern search engines mostly ignore this field but some smaller engines and AdSense still read it.
          </p>
        </div>
        <div>
          <label className="label">Open Graph title (social shares)</label>
          <input
            className="input"
            value={siteVal.og_title || ''}
            onChange={(e) => setSiteVal({ ...siteVal, og_title: e.target.value })}
            placeholder={siteVal.seo_title || `${siteVal.name} — ${siteVal.tagline}`}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Title shown when your homepage is shared on Facebook, Twitter/X, LinkedIn, etc. If empty, uses the SEO title.
          </p>
        </div>
        <div>
          <label className="label">Open Graph description (social shares)</label>
          <textarea
            className="input"
            rows={2}
            value={siteVal.og_description || ''}
            onChange={(e) => setSiteVal({ ...siteVal, og_description: e.target.value })}
            placeholder={siteVal.seo_description || siteVal.description}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Description shown on social shares of the homepage. Often punchier than the search-engine description.
          </p>
        </div>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Footer</h2>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Brand tagline (under footer logo)</label>
          <textarea className="input" rows={3} value={footerVal.brand_tagline} onChange={(e) => setFooterVal({ ...footerVal, brand_tagline: e.target.value })} />
        </div>
        <div>
          <label className="label">Copyright line</label>
          <input className="input" value={footerVal.copyright} onChange={(e) => setFooterVal({ ...footerVal, copyright: e.target.value })} />
        </div>
        <div>
          <label className="label">Version label (right side of footer)</label>
          <input className="input" value={footerVal.version_label} onChange={(e) => setFooterVal({ ...footerVal, version_label: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
