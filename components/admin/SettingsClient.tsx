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
          <label className="label">Meta description (SEO)</label>
          <textarea className="input" rows={2} value={siteVal.description} onChange={(e) => setSiteVal({ ...siteVal, description: e.target.value })} />
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
