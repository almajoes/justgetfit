'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Author } from '@/lib/supabase';

/**
 * <AuthorsClient />
 *
 * Admin UI at /admin/authors. CRUD for the authors table that feeds the
 * byline pool. The list is sortable by sort_order; admins can add new
 * authors, toggle active status, edit fields inline, or delete. Deleting
 * an author is destructive — posts that referenced them fall back to
 * "Just Get Fit Editorial" (the FK is ON DELETE SET NULL).
 *
 * Photo: drag-drop / click-to-choose uploader (see <PhotoUploader/> at
 * the bottom of this file). Files are resized to 400×400 webp client-side,
 * uploaded to the Supabase Storage `author-photos` bucket via
 * /api/admin/authors/upload-photo, and the returned public URL is stored
 * in author.photo_url.
 *
 * Photo credit: optional. Required when the photo is from Unsplash or
 * another third-party source that requires attribution; admins are
 * trusted to fill it in for those cases. Custom uploads don't need it.
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
          onError={setError}
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
              onError={setError}
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
  onError,
}: {
  draft: EditDraft;
  onChange: (d: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
  onError?: (msg: string) => void;
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
        <Field label="Photo" wide>
          <PhotoUploader
            value={draft.photo_url}
            onChange={(url) => set('photo_url', url)}
            onError={(msg) => onError?.(msg)}
          />
        </Field>
        <Field label="Photo credit (only needed for Unsplash or third-party photos)" wide>
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

/**
 * <PhotoUploader />
 *
 * Drag-drop / click-to-choose image uploader for the author photo. Steps:
 *
 *   1. User picks a file (or drops one).
 *   2. We resize it client-side using a <canvas> — square center-crop to
 *      400×400, then re-encode as webp at quality 0.85. This keeps the
 *      server simple (no `sharp` dep) and the upload payload small.
 *   3. POST the resized blob to /api/admin/authors/upload-photo as
 *      multipart/form-data.
 *   4. On success, the API returns a public URL; we call onChange(url)
 *      so the parent EditCard updates the draft.photo_url.
 *
 * Preview: when value (URL) is set, show the photo with a "Replace" /
 * "Remove" overlay. When empty, show the dropzone.
 *
 * Errors propagate up via onError so the parent shows them in its
 * error banner.
 */
const TARGET_SIZE = 400; // px square
const TARGET_QUALITY = 0.85;
const MAX_INPUT_BYTES = 12 * 1024 * 1024; // pre-resize cap (12 MB) — generous; resize will shrink

function PhotoUploader({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  onError?: (msg: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragHover, setDragHover] = useState(false);

  function reportError(msg: string) {
    if (onError) onError(msg);
    else console.error('[PhotoUploader]', msg);
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      reportError(`Selected file is not an image (got ${file.type || 'unknown type'}).`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      reportError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Pick something under 12 MB; we'll resize it.`);
      return;
    }

    setUploading(true);
    try {
      // Resize via canvas. Square center-crop so the avatar always
      // displays without distortion. Re-encode as webp at 0.85 quality —
      // good visual quality at very small file sizes.
      const blob = await resizeToSquareWebp(file, TARGET_SIZE, TARGET_QUALITY);
      if (!blob) {
        reportError('Failed to process image. Try a different file.');
        return;
      }

      const fd = new FormData();
      // Name needs an extension so the server can pick the right
      // Content-Type when storing — webp here.
      fd.append('file', new File([blob], 'photo.webp', { type: 'image/webp' }));

      const res = await fetch('/api/admin/authors/upload-photo', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        reportError(data.error || `Upload failed (${res.status})`);
        return;
      }
      onChange(data.url);
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onPickClick() {
    fileInputRef.current?.click();
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    // Reset so picking the same file again still fires onChange
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileInputChange}
        style={{ display: 'none' }}
      />

      {value ? (
        // Preview + actions
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 12,
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            borderRadius: 10,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Author"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
              border: '1px solid var(--line)',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
              {uploading ? 'Uploading replacement…' : 'Photo set.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onPickClick}
                disabled={uploading}
                className="btn btn-ghost"
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                disabled={uploading}
                className="btn btn-ghost"
                style={{ padding: '6px 12px', fontSize: 12, color: '#ff9c9c' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Dropzone
        <div
          onClick={onPickClick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragHover(true);
          }}
          onDragLeave={() => setDragHover(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPickClick();
            }
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 20px',
            background: dragHover ? 'rgba(196,255,61,0.05)' : 'var(--bg-2)',
            border: `2px dashed ${dragHover ? 'var(--neon)' : 'var(--line)'}`,
            borderRadius: 10,
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'background 0.12s, border-color 0.12s',
            textAlign: 'center',
          }}
        >
          {uploading ? (
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Uploading…</div>
          ) : (
            <>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.6 }}>📷</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
                Drop an image, or <span style={{ color: 'var(--neon)' }}>click to choose</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                JPG / PNG / WebP. Resized to 400×400 webp on upload.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Square-crop + resize an image to a target size, return a webp Blob.
 * Center-crop: take the largest centered square that fits the source,
 * scale that to the target size. Uses the browser's <canvas> — runs
 * client-side, no server processing needed.
 *
 * Returns null on encode failure (very rare; canvas.toBlob can return
 * null when called on a tainted canvas, but we control the source).
 */
async function resizeToSquareWebp(
  file: File,
  target: number,
  quality: number
): Promise<Blob | null> {
  // Decode the file to an HTMLImageElement so we can paint it on canvas.
  const img = await loadImage(file);
  try {
    // Compute the centered square crop in source coordinates.
    const sourceShortSide = Math.min(img.width, img.height);
    const sx = (img.width - sourceShortSide) / 2;
    const sy = (img.height - sourceShortSide) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // High-quality scaling. browsers default to 'low' which looks blocky.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, sx, sy, sourceShortSide, sourceShortSide, 0, 0, target, target);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    });
  } finally {
    // Free the object URL we created in loadImage().
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  }
}

/**
 * Load a File as an HTMLImageElement. Uses an object URL so we don't
 * have to base64-encode a potentially large file.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}
