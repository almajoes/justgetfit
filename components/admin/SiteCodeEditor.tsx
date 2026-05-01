'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type SiteCode = {
  meta_tags: string;
  head_scripts: string;
  body_scripts: string;
};

export function SiteCodeEditor({ initial }: { initial: SiteCode }) {
  const router = useRouter();
  const [values, setValues] = useState<SiteCode>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/site-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function update(field: keyof SiteCode, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--neon)', marginBottom: 6 }}>Admin · CMS</p>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Site code</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, maxWidth: 640, lineHeight: 1.6 }}>
            Inject meta tags and analytics scripts into every page on the site. Use this for site verification (Google Search Console, Bing) and tracking codes (Google Analytics, Plausible, Fathom).
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '12px 24px' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'rgb(252,165,165)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(196,255,61,0.07)', border: '1px solid rgba(196,255,61,0.3)', color: 'var(--neon)', fontSize: 13 }}>
          ✓ Saved at {savedAt}. Public site will reflect changes within ~30 seconds.
        </div>
      )}

      <div
        style={{
          marginBottom: 24,
          padding: '14px 18px',
          borderRadius: 10,
          background: 'rgba(255,184,77,0.06)',
          border: '1px solid rgba(255,184,77,0.25)',
          color: '#ffb84d',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 4 }}>⚠ Heads up</strong>
        Whatever you paste here gets injected raw into every page. Bad HTML or broken JavaScript can break the entire site. Test on one snippet at a time. Only paste code from sources you trust.
      </div>

      <Section
        title="Meta tags"
        hint="Site verification tags from Google Search Console, Bing Webmaster Tools, etc. Paste the entire <meta /> tag(s) — these get rendered properly in <head> for crawlers to find."
        example={`<meta name="google-site-verification" content="abc123XYZ..." />
<meta name="msvalidate.01" content="ABC123..." />`}
        value={values.meta_tags}
        onChange={(v) => update('meta_tags', v)}
        rows={5}
      />

      <Section
        title="Head scripts (analytics)"
        hint="Analytics scripts that run on every page (Google Analytics, Plausible, Fathom, etc.). Paste the full snippet exactly as the analytics provider gave it to you (including <script> tags)."
        example={`<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>

<!-- Or Plausible -->
<script defer data-domain="justgetfit.org" src="https://plausible.io/js/script.js"></script>`}
        value={values.head_scripts}
        onChange={(v) => update('head_scripts', v)}
        rows={10}
      />

      <Section
        title="Body scripts"
        hint="Scripts that should load near the end of the page (chat widgets, late-loading trackers). Goes near </body>."
        example={`<!-- Example: Crisp chat widget -->
<script type="text/javascript">
  window.$crisp=[];window.CRISP_WEBSITE_ID="abc-def";
  /* ... */
</script>`}
        value={values.body_scripts}
        onChange={(v) => update('body_scripts', v)}
        rows={6}
      />

      <div style={{ marginTop: 32, padding: '20px 24px', borderRadius: 10, background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>How to verify with Google Search Console</h3>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
          <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" style={{ color: 'var(--neon)' }}>Google Search Console</a> → Add Property → URL prefix → <code style={codeStyle}>https://justgetfit.org</code></li>
          <li>Choose &ldquo;HTML tag&rdquo; verification method</li>
          <li>Copy the <code style={codeStyle}>&lt;meta name=&quot;google-site-verification&quot; content=&quot;...&quot; /&gt;</code> tag they give you</li>
          <li>Paste it in the &ldquo;Meta tags&rdquo; field above and click Save</li>
          <li>Wait ~30 seconds for the public site to refresh, then click Verify in Search Console</li>
          <li>Once verified, submit your sitemap: <code style={codeStyle}>sitemap.xml</code></li>
        </ol>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  example,
  value,
  onChange,
  rows,
}: {
  title: string;
  hint: string;
  example: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</label>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.5 }}>{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        placeholder={example}
        className="input"
        style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, lineHeight: 1.5, resize: 'vertical', whiteSpace: 'pre' }}
      />
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'monospace',
};
