'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AnyContent = Record<string, any>;

export function PageEditor({ slug, initialContent }: { slug: string; initialContent: AnyContent }) {
  const router = useRouter();
  const [content, setContent] = useState<AnyContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(path: (string | number)[], value: any) {
    setContent((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let target: any = next;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
      target[path[path.length - 1]] = value;
      return next;
    });
  }

  function addItem(arrayKey: string, template: AnyContent) {
    setContent((prev) => ({ ...prev, [arrayKey]: [...(prev[arrayKey] || []), template] }));
  }
  function removeItem(arrayKey: string, idx: number) {
    setContent((prev) => ({ ...prev, [arrayKey]: prev[arrayKey].filter((_: any, i: number) => i !== idx) }));
  }
  function moveItem(arrayKey: string, idx: number, dir: -1 | 1) {
    setContent((prev) => {
      const arr = [...(prev[arrayKey] || [])];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...prev, [arrayKey]: arr };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pages/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Save failed.');
      } else {
        setSavedAt(new Date().toLocaleTimeString());
        router.refresh();
      }
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  const TITLES: Record<string, string> = {
    'home-hero': 'Home Hero',
    about: 'About Us',
    subscribe: 'Subscribe',
    contact: 'Contact Us',
    app: 'App',
  };

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            Edit: {TITLES[slug]}
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 4 }}>
            Public path: <code>/{slug === 'home-hero' ? '' : slug}</code>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {savedAt && <span style={{ color: 'var(--neon)', fontSize: 13 }}>Saved {savedAt}</span>}
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '10px 22px', fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(255,107,107,0.1)', border: '1px solid #ff6b6b', borderRadius: 8, color: '#ff6b6b', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* SHARED HEADLINE FIELDS for all 4 pages */}
        <Field label="Pill text">
          <input
            className="input"
            value={content.pill_text || ''}
            onChange={(e) => update(['pill_text'], e.target.value)}
          />
        </Field>

        <div className="admin-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Headline (part 1)">
            <input className="input" value={content.headline_part1 || ''} onChange={(e) => update(['headline_part1'], e.target.value)} />
          </Field>
          <Field label="Headline (italic accent)">
            <input className="input" value={content.headline_accent || ''} onChange={(e) => update(['headline_accent'], e.target.value)} />
          </Field>
          <Field label="Headline (part 2)">
            <input className="input" value={content.headline_part2 || ''} onChange={(e) => update(['headline_part2'], e.target.value)} />
          </Field>
        </div>

        {/* HOME HERO specific */}
        {slug === 'home-hero' && (
          <>
            <Field label="Lede paragraph">
              <textarea className="input" rows={4} value={content.lede || ''} onChange={(e) => update(['lede'], e.target.value)} />
            </Field>
            <CTAFields content={content} onChange={update} />
            <Field label="Hero background image">
              <UnsplashPicker
                value={content.background_image_url || ''}
                onChange={(url) => update(['background_image_url'], url)}
                emptyHint="Leave empty to use the gradient background instead."
              />
            </Field>
            <ArrayEditor
              title="Stat tiles (4 across the hero)"
              items={content.stats || []}
              onAdd={() => addItem('stats', { num: '', suffix: '', label: '' })}
              onRemove={(i) => removeItem('stats', i)}
              onMove={(i, d) => moveItem('stats', i, d)}
              renderItem={(item, i) => (
                <div className="admin-grid-rowstack" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 2fr', gap: 8 }}>
                  <input className="input" placeholder="Number" value={item.num || ''} onChange={(e) => update(['stats', i, 'num'], e.target.value)} />
                  <input className="input" placeholder="+/%" value={item.suffix || ''} onChange={(e) => update(['stats', i, 'suffix'], e.target.value)} />
                  <input className="input" placeholder="Label" value={item.label || ''} onChange={(e) => update(['stats', i, 'label'], e.target.value)} />
                </div>
              )}
            />
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-2)' }}>Tip:</strong> use <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>auto:posts</code> in the Number field to show the live count of published articles, or <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>auto:categories</code> for the live category count. Anything else renders as-is.
            </p>
          </>
        )}

        {/* ABOUT specific */}
        {slug === 'about' && (
          <>
            <Field label="Tagline (italic serif)">
              <textarea className="input" rows={3} value={content.tagline || ''} onChange={(e) => update(['tagline'], e.target.value)} />
            </Field>
            <Field label="Body (Markdown — supports ## headings, **bold**, etc.)">
              <textarea className="input" rows={14} style={{ fontFamily: 'monospace', fontSize: 13 }} value={content.body_markdown || ''} onChange={(e) => update(['body_markdown'], e.target.value)} />
            </Field>
            <ArrayEditor
              title="Pillar cards"
              items={content.pillars || []}
              onAdd={() => addItem('pillars', { num: '0X', title: '', desc: '' })}
              onRemove={(i) => removeItem('pillars', i)}
              onMove={(i, d) => moveItem('pillars', i, d)}
              renderItem={(item, i) => (
                <div className="admin-grid-rowstack" style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
                  <input className="input" placeholder="01" value={item.num || ''} onChange={(e) => update(['pillars', i, 'num'], e.target.value)} />
                  <input className="input" placeholder="Pillar title" value={item.title || ''} onChange={(e) => update(['pillars', i, 'title'], e.target.value)} />
                  <div />
                  <textarea className="input" rows={2} placeholder="Description" value={item.desc || ''} onChange={(e) => update(['pillars', i, 'desc'], e.target.value)} />
                </div>
              )}
            />
            <CTAFields content={content} onChange={update} />
          </>
        )}

        {/* SUBSCRIBE specific */}
        {slug === 'subscribe' && (
          <>
            <Field label="Lede paragraph">
              <textarea className="input" rows={3} value={content.lede || ''} onChange={(e) => update(['lede'], e.target.value)} />
            </Field>
            <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Form placeholder">
                <input className="input" value={content.form_placeholder || ''} onChange={(e) => update(['form_placeholder'], e.target.value)} />
              </Field>
              <Field label="Form button label">
                <input className="input" value={content.form_button || ''} onChange={(e) => update(['form_button'], e.target.value)} />
              </Field>
            </div>
            <Field label="Promise section heading">
              <input className="input" value={content.promise_heading || ''} onChange={(e) => update(['promise_heading'], e.target.value)} />
            </Field>
            <ArrayEditor
              title="Promise cards"
              items={content.promises || []}
              onAdd={() => addItem('promises', { icon: '✨', title: '', desc: '' })}
              onRemove={(i) => removeItem('promises', i)}
              onMove={(i, d) => moveItem('promises', i, d)}
              renderItem={(item, i) => (
                <div className="admin-grid-rowstack" style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8 }}>
                  <input className="input" placeholder="🎯" value={item.icon || ''} onChange={(e) => update(['promises', i, 'icon'], e.target.value)} />
                  <input className="input" placeholder="Title" value={item.title || ''} onChange={(e) => update(['promises', i, 'title'], e.target.value)} />
                  <div />
                  <textarea className="input" rows={2} placeholder="Description" value={item.desc || ''} onChange={(e) => update(['promises', i, 'desc'], e.target.value)} />
                </div>
              )}
            />
            <Field label="FAQ section heading">
              <input className="input" value={content.faq_heading || ''} onChange={(e) => update(['faq_heading'], e.target.value)} />
            </Field>
            <ArrayEditor
              title="FAQ entries"
              items={content.faqs || []}
              onAdd={() => addItem('faqs', { q: '', a: '' })}
              onRemove={(i) => removeItem('faqs', i)}
              onMove={(i, d) => moveItem('faqs', i, d)}
              renderItem={(item, i) => (
                <>
                  <input className="input" placeholder="Question" value={item.q || ''} onChange={(e) => update(['faqs', i, 'q'], e.target.value)} style={{ marginBottom: 8 }} />
                  <textarea className="input" rows={3} placeholder="Answer (Markdown supported)" value={item.a || ''} onChange={(e) => update(['faqs', i, 'a'], e.target.value)} />
                </>
              )}
            />
          </>
        )}

        {/* CONTACT specific */}
        {slug === 'contact' && (
          <>
            <Field label="Intro paragraph">
              <textarea className="input" rows={3} value={content.intro || ''} onChange={(e) => update(['intro'], e.target.value)} />
            </Field>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Form labels</h3>
            <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name label"><input className="input" value={content.labels?.name || ''} onChange={(e) => update(['labels', 'name'], e.target.value)} /></Field>
              <Field label="Email label"><input className="input" value={content.labels?.email || ''} onChange={(e) => update(['labels', 'email'], e.target.value)} /></Field>
              <Field label="Subject label"><input className="input" value={content.labels?.subject || ''} onChange={(e) => update(['labels', 'subject'], e.target.value)} /></Field>
              <Field label="Message label"><input className="input" value={content.labels?.message || ''} onChange={(e) => update(['labels', 'message'], e.target.value)} /></Field>
            </div>
            <Field label="Submit button text">
              <input className="input" value={content.labels?.submit || ''} onChange={(e) => update(['labels', 'submit'], e.target.value)} />
            </Field>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Form placeholders</h3>
            <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name placeholder"><input className="input" value={content.placeholders?.name || ''} onChange={(e) => update(['placeholders', 'name'], e.target.value)} /></Field>
              <Field label="Email placeholder"><input className="input" value={content.placeholders?.email || ''} onChange={(e) => update(['placeholders', 'email'], e.target.value)} /></Field>
              <Field label="Subject placeholder"><input className="input" value={content.placeholders?.subject || ''} onChange={(e) => update(['placeholders', 'subject'], e.target.value)} /></Field>
              <Field label="Message placeholder"><input className="input" value={content.placeholders?.message || ''} onChange={(e) => update(['placeholders', 'message'], e.target.value)} /></Field>
            </div>
            <Field label="Success message (shown after submit)">
              <textarea className="input" rows={2} value={content.success_message || ''} onChange={(e) => update(['success_message'], e.target.value)} />
            </Field>
          </>
        )}

        {/* APP specific — manages everything on /app AND the shared Hero/CTA
            card used at the top of /app and at the end of every article. */}
        {slug === 'app' && (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>Hero / CTA card (shared with article-end CTA)</h3>
            <div style={{ padding: 12, background: 'rgba(196,255,61,0.06)', borderRadius: 8, border: '1px solid rgba(196,255,61,0.2)', fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
              <strong style={{ color: 'var(--neon)' }}>Note:</strong> This card appears in two places — at the top
              of <code>/app</code> as a hero, and at the end of every article as an inline card. Most fields are shared,
              but subhead text, primary button label, and secondary link differ per variant (so the article-end card
              can read short while the /app hero reads long).
            </div>
            <Field label="Eyebrow tag (e.g. 'New · The Just Get Fit App')">
              <input className="input" value={content.cta_eyebrow || ''} onChange={(e) => update(['cta_eyebrow'], e.target.value)} />
            </Field>
            <Field label="Headline">
              <input className="input" value={content.cta_headline || ''} onChange={(e) => update(['cta_headline'], e.target.value)} />
            </Field>
            <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Subhead — INLINE variant (article-end, keep concise)">
                <textarea className="input" rows={3} value={content.cta_subhead_inline || ''} onChange={(e) => update(['cta_subhead_inline'], e.target.value)} />
              </Field>
              <Field label="Subhead — HERO variant (/app top, can be longer)">
                <textarea className="input" rows={3} value={content.cta_subhead_hero || ''} onChange={(e) => update(['cta_subhead_hero'], e.target.value)} />
              </Field>
            </div>
            <ArrayEditor
              title="Feature cards (3-column grid in the CTA)"
              items={content.cta_features || []}
              onAdd={() => addItem('cta_features', { icon: '✨', title: '', desc: '' })}
              onRemove={(i) => removeItem('cta_features', i)}
              onMove={(i, d) => moveItem('cta_features', i, d)}
              renderItem={(item, i) => (
                <div className="admin-grid-rowstack" style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8 }}>
                  <input className="input" placeholder="🎯" value={item.icon || ''} onChange={(e) => update(['cta_features', i, 'icon'], e.target.value)} />
                  <input className="input" placeholder="Title" value={item.title || ''} onChange={(e) => update(['cta_features', i, 'title'], e.target.value)} />
                  <div />
                  <textarea className="input" rows={2} placeholder="Short description" value={item.desc || ''} onChange={(e) => update(['cta_features', i, 'desc'], e.target.value)} />
                </div>
              )}
            />
            <Field label="Primary button URL (where the main CTA links to — typically https://app.justgetfit.org)">
              <input className="input" value={content.cta_primary_url || ''} onChange={(e) => update(['cta_primary_url'], e.target.value)} />
            </Field>
            <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-2)' }}>INLINE variant (article-end)</h4>
                <Field label="Primary button label">
                  <input className="input" value={content.cta_primary_label_inline || ''} onChange={(e) => update(['cta_primary_label_inline'], e.target.value)} />
                </Field>
                <Field label="Secondary link label">
                  <input className="input" value={content.cta_secondary_label_inline || ''} onChange={(e) => update(['cta_secondary_label_inline'], e.target.value)} />
                </Field>
                <Field label="Secondary link href">
                  <input className="input" value={content.cta_secondary_href_inline || ''} onChange={(e) => update(['cta_secondary_href_inline'], e.target.value)} />
                </Field>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-2)' }}>HERO variant (/app top)</h4>
                <Field label="Primary button label">
                  <input className="input" value={content.cta_primary_label_hero || ''} onChange={(e) => update(['cta_primary_label_hero'], e.target.value)} />
                </Field>
                <Field label="Secondary link label">
                  <input className="input" value={content.cta_secondary_label_hero || ''} onChange={(e) => update(['cta_secondary_label_hero'], e.target.value)} />
                </Field>
                <Field label="Secondary link href">
                  <input className="input" value={content.cta_secondary_href_hero || ''} onChange={(e) => update(['cta_secondary_href_hero'], e.target.value)} />
                </Field>
              </div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 24 }}>Hero video (optional)</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: -4, marginBottom: 12 }}>
              Paste a YouTube URL to embed a video at the very top of the /app page, above the page title. Accepts <code>youtube.com/watch?v=…</code>, <code>youtu.be/…</code>, <code>youtube.com/shorts/…</code>, or <code>youtube.com/embed/…</code>. Leave blank to hide.
            </p>
            <Field label="YouTube URL">
              <input
                className="input"
                placeholder="https://www.youtube.com/watch?v=…"
                value={content.hero_video_url || ''}
                onChange={(e) => update(['hero_video_url'], e.target.value)}
              />
            </Field>

            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 24 }}>Page content</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: -4, marginBottom: 12 }}>
              The /app page renders as a single-column document. Edit the page title, intro, and sections below. Each section can have an optional intro, and any number of subsections (each with optional title, intro, and a flat bullet list — no nested bullets).
            </p>

            <Field label="Page title (H1)">
              <input className="input" value={content.page_title || ''} onChange={(e) => update(['page_title'], e.target.value)} />
            </Field>
            <Field label="Page intro paragraph">
              <textarea className="input" rows={4} placeholder="Lead paragraph that appears under the H1." value={content.page_intro || ''} onChange={(e) => update(['page_intro'], e.target.value)} />
            </Field>

            <ArrayEditor
              title="Sections"
              items={content.doc_sections || []}
              onAdd={() => addItem('doc_sections', { title: '', intro: '', subsections: [] })}
              onRemove={(i) => removeItem('doc_sections', i)}
              onMove={(i, d) => moveItem('doc_sections', i, d)}
              renderItem={(section, si) => (
                <>
                  <Field label="Section title (H2)">
                    <input className="input" placeholder="e.g. Personalized Training Programs" value={section.title || ''} onChange={(e) => update(['doc_sections', si, 'title'], e.target.value)} />
                  </Field>
                  <Field label="Section intro (optional)">
                    <textarea className="input" rows={3} placeholder="Optional paragraph that appears under the H2 (use a blank line for paragraph breaks)." value={section.intro || ''} onChange={(e) => update(['doc_sections', si, 'intro'], e.target.value)} />
                  </Field>

                  <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                        Subsections
                      </h4>
                      <button
                        onClick={() =>
                          update(
                            ['doc_sections', si, 'subsections'],
                            [...(section.subsections || []), { title: '', intro: '', items: [] }]
                          )
                        }
                        className="btn btn-ghost"
                        style={{ padding: '5px 12px', fontSize: 12 }}
                      >
                        + Add subsection
                      </button>
                    </div>

                    {(section.subsections || []).map((sub: any, ssi: number) => (
                      <div key={ssi} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
                          <button
                            onClick={() => {
                              const arr = [...(section.subsections || [])];
                              const j = ssi - 1;
                              if (j < 0) return;
                              [arr[ssi], arr[j]] = [arr[j], arr[ssi]];
                              update(['doc_sections', si, 'subsections'], arr);
                            }}
                            disabled={ssi === 0}
                            style={miniBtn}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => {
                              const arr = [...(section.subsections || [])];
                              const j = ssi + 1;
                              if (j >= arr.length) return;
                              [arr[ssi], arr[j]] = [arr[j], arr[ssi]];
                              update(['doc_sections', si, 'subsections'], arr);
                            }}
                            disabled={ssi === (section.subsections || []).length - 1}
                            style={miniBtn}
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => {
                              const arr = (section.subsections || []).filter((_: any, i: number) => i !== ssi);
                              update(['doc_sections', si, 'subsections'], arr);
                            }}
                            style={{ ...miniBtn, color: '#ff6b6b' }}
                          >
                            Delete
                          </button>
                        </div>

                        <Field label="Subsection title (H3, optional)">
                          <input className="input" placeholder="e.g. Training plan customization includes:" value={sub.title || ''} onChange={(e) => update(['doc_sections', si, 'subsections', ssi, 'title'], e.target.value)} />
                        </Field>
                        <Field label="Subsection intro (optional)">
                          <textarea className="input" rows={2} placeholder="Optional paragraph between the H3 and the bullet list." value={sub.intro || ''} onChange={(e) => update(['doc_sections', si, 'subsections', ssi, 'intro'], e.target.value)} />
                        </Field>
                        <Field label="Bullet items — one per line">
                          <textarea
                            className="input"
                            rows={6}
                            placeholder={'Item one\nItem two\nItem three'}
                            value={(sub.items || []).join('\n')}
                            onChange={(e) =>
                              update(
                                ['doc_sections', si, 'subsections', ssi, 'items'],
                                e.target.value.split('\n').map((s: string) => s.replace(/^[\s•·\-*]+/, '').trimEnd())
                              )
                            }
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                          />
                        </Field>
                      </div>
                    ))}

                    {(section.subsections || []).length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
                        No subsections yet. A section can have just an intro paragraph, or any number of subsections.
                      </p>
                    )}
                  </div>
                </>
              )}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function CTAFields({ content, onChange }: { content: AnyContent; onChange: (path: any[], value: any) => void }) {
  return (
    <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Primary CTA</div>
        <input className="input" placeholder="Label" value={content.cta_primary?.label || ''} onChange={(e) => onChange(['cta_primary', 'label'], e.target.value)} style={{ marginBottom: 8 }} />
        <input className="input" placeholder="URL" value={content.cta_primary?.url || ''} onChange={(e) => onChange(['cta_primary', 'url'], e.target.value)} />
      </div>
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Secondary CTA</div>
        <input className="input" placeholder="Label" value={content.cta_secondary?.label || ''} onChange={(e) => onChange(['cta_secondary', 'label'], e.target.value)} style={{ marginBottom: 8 }} />
        <input className="input" placeholder="URL" value={content.cta_secondary?.url || ''} onChange={(e) => onChange(['cta_secondary', 'url'], e.target.value)} />
      </div>
    </div>
  );
}

function ArrayEditor<T extends AnyContent>({
  title,
  items,
  onAdd,
  onRemove,
  onMove,
  renderItem,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  renderItem: (item: T, idx: number) => React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{title}</h3>
        <button onClick={onAdd} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}>+ Add</button>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
            <button onClick={() => onMove(i, -1)} disabled={i === 0} style={miniBtn}>↑</button>
            <button onClick={() => onMove(i, 1)} disabled={i === items.length - 1} style={miniBtn}>↓</button>
            <button onClick={() => onRemove(i)} style={{ ...miniBtn, color: '#ff6b6b' }}>Delete</button>
          </div>
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-2)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/**
 * UnsplashPicker — search Unsplash inline, click a thumbnail to set the URL.
 * Shows a preview of the currently-selected URL above the search field.
 */
function UnsplashPicker({
  value,
  onChange,
  emptyHint,
}: {
  value: string;
  onChange: (url: string) => void;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<{ url: string; credit: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/unsplash?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setOptions(data.photos ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Current value preview */}
      {value ? (
        <div style={{ marginBottom: 12, position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '21/9', background: 'var(--bg-1)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button
            type="button"
            onClick={() => onChange('')}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✕ Remove
          </button>
        </div>
      ) : (
        emptyHint && (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
            {emptyHint}
          </div>
        )
      )}

      {/* URL input — manual paste */}
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://images.unsplash.com/..."
        style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 12 }}
      />

      {/* Unsplash search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search Unsplash for hero photos..."
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={search}
          disabled={busy || !query.trim()}
          className="btn btn-ghost"
          style={{ flexShrink: 0 }}
        >
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Results grid */}
      {options.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {options.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => onChange(p.url)}
              style={{
                aspectRatio: '16/9',
                borderRadius: 8,
                overflow: 'hidden',
                border: `2px solid ${value === p.url ? 'var(--neon)' : 'transparent'}`,
                cursor: 'pointer',
                padding: 0,
                background: 'transparent',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
