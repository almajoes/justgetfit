'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Partner } from '@/lib/supabase';

const DEFAULT_GRADIENTS = [
  'linear-gradient(135deg, #1a0303 0%, #4a0808 50%, #8b1a1a 100%)',
  'linear-gradient(135deg, #0a3d0a 0%, #1a6b1a 50%, #2d9b2d 100%)',
  'linear-gradient(135deg, #2c2c2e 0%, #4a4a4d 50%, #6a6a6d 100%)',
  'linear-gradient(135deg, #1a1a3e 0%, #2d2d6b 50%, #4949a8 100%)',
  'linear-gradient(135deg, #4a1a3d 0%, #6b2d5a 50%, #a8497d 100%)',
  'linear-gradient(135deg, #3d2c0a 0%, #6b4a1a 50%, #a87a2d 100%)',
];

export function PartnersClient({ initialPartners }: { initialPartners: Partner[] }) {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>(initialPartners);
  const [editing, setEditing] = useState<string | null>(null);

  function update(id: string, patch: Partial<Partner>) {
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function persist(id: string) {
    const p = partners.find((x) => x.id === id);
    if (!p) return;
    await fetch(`/api/admin/partners/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    router.refresh();
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this partner card?')) return;
    await fetch(`/api/admin/partners/${id}`, { method: 'DELETE' });
    setPartners((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  async function addItem() {
    const max = Math.max(0, ...partners.map((p) => p.position));
    const res = await fetch('/api/admin/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Partner',
        blurb: 'Short description.',
        url: 'https://example.com',
        tag: 'Partner',
        image_gradient: DEFAULT_GRADIENTS[partners.length % DEFAULT_GRADIENTS.length],
        initials: 'XX',
        position: max + 1,
        is_active: true,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setPartners((prev) => [...prev, json.item]);
      setEditing(json.item.id);
      router.refresh();
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = partners.findIndex((p) => p.id === id);
    const j = idx + dir;
    if (j < 0 || j >= partners.length) return;
    const a = partners[idx];
    const b = partners[j];
    update(a.id, { position: b.position });
    update(b.id, { position: a.position });
    await Promise.all([persist(a.id), persist(b.id)]);
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Partners</h1>
        <button onClick={addItem} className="btn btn-primary" style={{ padding: '10px 22px', fontSize: 13 }}>+ Add partner</button>
      </div>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>Cards displayed on the public /partners page.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {partners.map((p, idx) => {
          const isEditing = editing === p.id;
          const previewStyle: React.CSSProperties = p.image_url
            ? { backgroundImage: `url('${p.image_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: p.image_gradient || DEFAULT_GRADIENTS[0] };

          return (
            <div key={p.id} style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, display: 'flex', gap: 16 }}>
              <div
                style={{
                  width: 120,
                  height: 80,
                  borderRadius: 8,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 16,
                  ...previewStyle,
                }}
              >
                {!p.image_url && p.initials}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {!isEditing ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                    {p.tag && <div style={{ fontSize: 11, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{p.tag}</div>}
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4, lineHeight: 1.5 }}>{p.blurb}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.url}</div>
                  </>
                ) : (
                  <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="input" placeholder="Name" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                    <input className="input" placeholder="Tag (e.g. Recommended Reading)" value={p.tag || ''} onChange={(e) => update(p.id, { tag: e.target.value })} />
                    <input className="input" placeholder="URL" value={p.url} onChange={(e) => update(p.id, { url: e.target.value })} />
                    <input className="input" placeholder="Initials/wordmark" value={p.initials || ''} onChange={(e) => update(p.id, { initials: e.target.value })} />
                    <textarea className="input" rows={2} placeholder="Blurb" value={p.blurb} onChange={(e) => update(p.id, { blurb: e.target.value })} style={{ gridColumn: 'span 2' }} />
                    <input className="input" placeholder="Image URL (optional, overrides gradient)" value={p.image_url || ''} onChange={(e) => update(p.id, { image_url: e.target.value })} style={{ gridColumn: 'span 2' }} />
                    <input className="input" placeholder="Image gradient (CSS)" value={p.image_gradient || ''} onChange={(e) => update(p.id, { image_gradient: e.target.value })} style={{ gridColumn: 'span 2' }} />
                    <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={p.is_active} onChange={(e) => update(p.id, { is_active: e.target.checked })} />
                      Active (visible on public site)
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                <button onClick={() => move(p.id, -1)} disabled={idx === 0} style={miniBtn}>↑</button>
                <button onClick={() => move(p.id, 1)} disabled={idx === partners.length - 1} style={miniBtn}>↓</button>
                {!isEditing ? (
                  <button onClick={() => setEditing(p.id)} style={miniBtn}>Edit</button>
                ) : (
                  <button onClick={async () => { await persist(p.id); setEditing(null); }} style={{ ...miniBtn, color: 'var(--neon)' }}>Save</button>
                )}
                <button onClick={() => deleteItem(p.id)} style={{ ...miniBtn, color: '#ff6b6b' }}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-2)',
  padding: '5px 10px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
