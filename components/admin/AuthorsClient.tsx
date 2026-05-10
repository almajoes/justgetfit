'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Author } from '@/lib/supabase';

/**
 * <AuthorsClient />
 *
 * Admin UI at /admin/authors. CRUD for the authors table that feeds the
 * round-robin byline rotation. The list is sortable by sort_order; admins
 * can add new authors, toggle active status, edit fields inline, or
 * delete. Deleting an author is destructive — posts that referenced them
 * fall back to "Just Get Fit Editorial" (the FK is ON DELETE SET NULL).
 *
 * Photo URLs: admins can paste any URL. The migration seeds Unsplash
 * portrait URLs but custom photos work too. Whenever a photo is shown on
 * the article page, the photo_credit field is also rendered (Unsplash
 * license requirement); admins should always include that string.
 */

type EditDraft = {
  slug: string;
  name: string;
  bio: string;
  photo_url: string;
  photo_credit: string;
  sort_order: number;
  is_active: boolean;
};

const EMPTY_DRAFT: EditDraft = {
  slug: '',
  name: '',
  bio: '',
  photo_url: '',
  photo_credit: '',
  sort_order: 0,
  is_active: true,
};

export function AuthorsClient({
  initialAuthors,
  rotationNext,
}: {
  initialAuthors: Author[];
  rotationNext: number;
}) {
  const router = useRouter();
  const [authors, setAuthors] = useState(initialAuthors);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<EditDraft>({
    ...EMPTY_DRAFT,
    sort_order: authors.length + 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = authors.filter((a) => a.is_active).length;
  const upcomingIdx = activeCount > 0 ? rotationNext % activeCount : 0;

  function startEdit(author: Author) {
    setEditingId(author.id);
    setEditDraft({
      slug: author.slug,
      name: author.name,
      bio: author.bio || '',
      photo_url: author.photo_url || '',
      photo_credit: author.photo_credit || '',
      sort_order: author.sort_order,
      is_active: author.is_active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/authors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAuthors((prev) => prev.map((a) => (a.id === id ? data.author : a)));
      cancelEdit();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAuthor(id: string, name: string) {
    if (!confirm(`Delete author "${name}"? Posts they bylined will fall back to "Just Get Fit Editorial".`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/authors/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAuthors((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function createAuthor() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAuthors((prev) => [...prev, data.author]);
      setCreating(false);
      setCreateDraft({ ...EMPTY_DRAFT, sort_order: authors.length + 2 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Authors</h1>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>
            Round-robin byline pool. New articles cycle through active authors in <code style={inlineCode}>sort_order</code>.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn btn-primary"
          disabled={busy || creating}
          style={{ padding: '10px 18px', fontSize: 13 }}
        >
          + Add author
        </button>
      </div>

      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 16,
          margin: '20px 0',
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          fontSize: 13,
        }}
      >
        <Stat label="Total" value={authors.length} />
        <Stat label="Active" value={activeCount} />
        <Stat label="Rotation index" value={rotationNext} hint="bumps on every new draft" />
        {activeCount > 0 && (
          <Stat
            label="Up next"
            value={authors.filter((a) => a.is_active)[upcomingIdx]?.name || '—'}
            hint={`#${upcomingIdx + 1} of ${activeCount}`}
          />
        )}
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(255,107,107,0.08)',
            border: '1px solid rgba(255,107,107,0.3)',
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: '#ff9c9c',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {creating && (
        <EditCard
          draft={createDraft}
          onChange={setCreateDraft}
          onSave={createAuthor}
          onCancel={() => setCreating(false)}
          busy={busy}
          saveLabel="Create author"
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {authors.length === 0 && !creating && (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--text-3)',
              border: '1px dashed var(--line)',
              borderRadius: 12,
              fontSize: 13,
            }}
          >
            No authors yet. Click "Add author" to create one.
          </div>
        )}

        {authors.map((a) =>
          editingId === a.id ? (
            <EditCard
              key={a.id}
              draft={editDraft}
              onChange={setEditDraft}
              onSave={() => saveEdit(a.id)}
              onCancel={cancelEdit}
              busy={busy}
              saveLabel="Save"
            />
          ) : (
            <RowCard
              key={a.id}
              author={a}
              onEdit={() => startEdit(a)}
              onDelete={() => deleteAuthor(a.id, a.name)}
              disabled={busy}
            />
          )
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function RowCard({
  author,
  onEdit,
  onDelete,
  disabled,
}: {
  author: Author;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        opacity: author.is_active ? 1 : 0.55,
      }}
    >
      {author.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.photo_url}
          alt={author.name}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
            border: '1px solid var(--line)',
          }}
        />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(196,255,61,0.12)',
            color: 'var(--neon)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {author.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{author.name}</span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 100,
              background: author.is_active ? 'rgba(196,255,61,0.10)' : 'rgba(255,255,255,0.05)',
              color: author.is_active ? 'var(--neon)' : 'var(--text-3)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {author.is_active ? 'Active' : 'Inactive'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>#{author.sort_order}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
          <code style={inlineCode}>{author.slug}</code>
        </div>
        {author.bio && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{author.bio}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onEdit} disabled={disabled} className="btn btn-ghost" style={btn}>
          Edit
        </button>
        <button onClick={onDelete} disabled={disabled} className="btn btn-ghost" style={{ ...btn, color: '#ff9c9c' }}>
          Delete
        </button>
      </div>
    </div>
  );
}

function EditCard({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  saveLabel,
}: {
  draft: EditDraft;
  onChange: (d: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
}) {
  function set<K extends keyof EditDraft>(key: K, value: EditDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--neon)',
        borderRadius: 12,
        padding: 18,
        boxShadow: '0 0 0 4px rgba(196,255,61,0.06)',
      }}
    >
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Name *">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            className="input"
            placeholder="Alex Reyes"
          />
        </Field>
        <Field label="Slug * (URL-safe, e.g. alex-reyes)">
          <input
            type="text"
            value={draft.slug}
            onChange={(e) => set('slug', e.target.value)}
            className="input"
            placeholder="alex-reyes"
          />
        </Field>
        <Field label="Bio (one line, no credentials we can't back up)" wide>
          <textarea
            value={draft.bio}
            onChange={(e) => set('bio', e.target.value)}
            className="input"
            rows={2}
            placeholder="Writes about strength training and the boring habits that compound."
          />
        </Field>
        <Field label="Photo URL" wide>
          <input
            type="url"
            value={draft.photo_url}
            onChange={(e) => set('photo_url', e.target.value)}
            className="input"
            placeholder="https://images.unsplash.com/..."
          />
        </Field>
        <Field label="Photo credit (Unsplash terms — required when photo is set)" wide>
          <input
            type="text"
            value={draft.photo_credit}
            onChange={(e) => set('photo_credit', e.target.value)}
            className="input"
            placeholder="Photo by ... on Unsplash"
          />
        </Field>
        <Field label="Sort order">
          <input
            type="number"
            value={draft.sort_order}
            onChange={(e) => set('sort_order', parseInt(e.target.value, 10) || 0)}
            className="input"
          />
        </Field>
        <Field label="Active">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              style={{ accentColor: 'var(--neon)', width: 16, height: 16 }}
            />
            Include in rotation
          </label>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={busy} className="btn btn-ghost" style={btn}>
          Cancel
        </button>
        <button onClick={onSave} disabled={busy || !draft.name.trim() || !draft.slug.trim()} className="btn btn-primary" style={btn}>
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto' }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inlineCode: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 11,
};

const btn: React.CSSProperties = { padding: '8px 14px', fontSize: 13 };
