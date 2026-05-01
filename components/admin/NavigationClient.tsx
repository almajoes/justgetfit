'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NavItem } from '@/lib/supabase';

type Location = 'main_nav' | 'footer_quick_links' | 'footer_categories';

const SECTIONS: { key: Location; title: string; desc: string; allowCta?: boolean }[] = [
  { key: 'main_nav', title: 'Main Navigation', desc: 'Top of every page. The "is CTA" item becomes the green button.', allowCta: true },
  { key: 'footer_quick_links', title: 'Footer · Quick Links', desc: 'Middle column of the footer.' },
  { key: 'footer_categories', title: 'Footer · Categories', desc: 'Right column of the footer (2 inner columns).' },
];

export function NavigationClient({ initialItems }: { initialItems: NavItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<NavItem[]>(initialItems);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const groups: Record<Location, NavItem[]> = {
    main_nav: [],
    footer_quick_links: [],
    footer_categories: [],
  };
  items.forEach((it) => groups[it.location].push(it));
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.sort_order - b.sort_order));

  function update(id: string, patch: Partial<NavItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function persist(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setSavingIds((s) => new Set(s).add(id));
    await fetch(`/api/admin/nav-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    setSavingIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    router.refresh();
  }

  async function move(id: string, location: Location, dir: -1 | 1) {
    const list = groups[location];
    const idx = list.findIndex((i) => i.id === id);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[idx];
    const b = list[j];
    update(a.id, { sort_order: b.sort_order });
    update(b.id, { sort_order: a.sort_order });
    await Promise.all([persist(a.id), persist(b.id)]);
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this nav item?')) return;
    await fetch(`/api/admin/nav-items/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((it) => it.id !== id));
    router.refresh();
  }

  async function addItem(location: Location) {
    const max = Math.max(0, ...groups[location].map((i) => i.sort_order));
    const res = await fetch('/api/admin/nav-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location,
        label: 'New item',
        url: '#',
        sort_order: max + 1,
        is_cta: false,
        active: true,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setItems((prev) => [...prev, json.item]);
      router.refresh();
    }
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Navigation</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>
        Edit menu items in the top nav and footer. Changes go live within ~60 seconds.
      </p>

      {SECTIONS.map((section) => (
        <section
          key={section.key}
          style={{ marginBottom: 40, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 24 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{section.title}</h2>
            <button onClick={() => addItem(section.key)} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}>
              + Add item
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>{section.desc}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups[section.key].map((it, idx) => (
              <div
                key={it.id}
                className="admin-grid-rowstack"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.5fr auto auto auto auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: 8,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 8,
                }}
              >
                <input
                  className="input"
                  value={it.label}
                  onChange={(e) => update(it.id, { label: e.target.value })}
                  onBlur={() => persist(it.id)}
                  placeholder="Label"
                />
                <input
                  className="input"
                  value={it.url}
                  onChange={(e) => update(it.id, { url: e.target.value })}
                  onBlur={() => persist(it.id)}
                  placeholder="URL"
                />
                {section.allowCta && (
                  <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}>
                    <input
                      type="checkbox"
                      checked={it.is_cta}
                      onChange={(e) => {
                        update(it.id, { is_cta: e.target.checked });
                        persist(it.id);
                      }}
                    />
                    CTA
                  </label>
                )}
                {!section.allowCta && <span />}
                <button onClick={() => move(it.id, section.key, -1)} disabled={idx === 0} style={miniBtn}>↑</button>
                <button onClick={() => move(it.id, section.key, 1)} disabled={idx === groups[section.key].length - 1} style={miniBtn}>↓</button>
                <button onClick={() => deleteItem(it.id)} style={{ ...miniBtn, color: '#ff6b6b' }}>×</button>
              </div>
            ))}
            {groups[section.key].length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: 13, padding: 8 }}>No items.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-2)',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
