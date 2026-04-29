'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Topic } from '@/lib/supabase';

export function TopicsClient({ topics }: { topics: Topic[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newTopic, setNewTopic] = useState({ title: '', category: '', angle: '' });
  const [editForm, setEditForm] = useState({ title: '', category: '', angle: '' });

  const unused = topics.filter((t) => !t.used_at);
  const used = topics.filter((t) => t.used_at);

  async function addTopic() {
    if (!newTopic.title.trim() || !newTopic.category.trim()) {
      setError('Title and category are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTopic),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewTopic({ title: '', category: '', angle: '' });
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(topic: Topic) {
    setEditingId(topic.id);
    setEditForm({
      title: topic.title,
      category: topic.category,
      angle: topic.angle ?? '',
    });
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/topics/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', ...editForm }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTopic(id: string) {
    if (!confirm('Delete this topic? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/topics/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function markUnused(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/topics/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_unused' }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--neon)' }}>Admin</p>
          <h1 className="text-4xl md:text-5xl font-bold" style={{ letterSpacing: '-0.02em' }}>Topic queue</h1>
          <p className="mt-2" style={{ color: 'var(--text-2)' }}>
            {unused.length} unused · {used.length} used · {topics.length} total
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary">
          {showAdd ? 'Cancel' : '+ Add topic'}
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'rgb(252,165,165)' }}>
          {error}
        </div>
      )}

      {showAdd && (
        <div className="mb-8 p-6 rounded-2xl" style={{ background: 'rgba(196,255,61,0.04)', border: '1px solid rgba(196,255,61,0.2)' }}>
          <h2 className="text-lg font-bold mb-4">New topic</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input value={newTopic.title} onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })} className="input" placeholder="e.g. The 5x5 method..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Category</label>
                <input value={newTopic.category} onChange={(e) => setNewTopic({ ...newTopic, category: e.target.value })} className="input" placeholder="e.g. strength, nutrition" />
              </div>
              <div>
                <label className="label">Angle (optional)</label>
                <input value={newTopic.angle} onChange={(e) => setNewTopic({ ...newTopic, angle: e.target.value })} className="input" placeholder="e.g. evidence-based myth-busting" />
              </div>
            </div>
            <button onClick={addTopic} disabled={busy} className="btn btn-primary">
              {busy ? 'Adding…' : 'Add to queue'}
            </button>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold mb-4">Available ({unused.length})</h2>
      <div className="space-y-2 mb-12">
        {unused.length === 0 ? (
          <p className="italic" style={{ color: 'var(--text-3)' }}>No unused topics. Add some to keep the cron going.</p>
        ) : (
          unused.map((t) => (
            <div key={t.id} className="p-4 rounded-lg" style={{ background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
              {editingId === t.id ? (
                <div className="space-y-3">
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="input" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="input" placeholder="Category" />
                    <input value={editForm.angle} onChange={(e) => setEditForm({ ...editForm, angle: e.target.value })} className="input" placeholder="Angle" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(t.id)} disabled={busy} className="btn btn-primary">Save</button>
                    <button onClick={() => setEditingId(null)} className="btn btn-ghost">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 text-xs">
                      <span style={{ color: 'var(--neon)' }}>{t.category}</span>
                      {t.angle && <span style={{ color: 'var(--text-3)' }}>· {t.angle}</span>}
                    </div>
                    <div className="font-medium">{t.title}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(t)} className="text-xs px-3 py-1.5 rounded hover:bg-white/5" style={{ color: 'var(--text-2)' }}>Edit</button>
                    <button onClick={() => deleteTopic(t.id)} className="text-xs px-3 py-1.5 rounded hover:bg-red-500/10" style={{ color: 'rgb(252,165,165)' }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {used.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-4">Used ({used.length})</h2>
          <div className="space-y-1">
            {used.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 rounded" style={{ color: 'var(--text-3)' }}>
                <div className="min-w-0 flex-1">
                  <span className="text-sm truncate">{t.title}</span>
                  <span className="text-xs ml-2">· {t.category}</span>
                </div>
                <button onClick={() => markUnused(t.id)} className="text-xs uppercase tracking-wider hover:text-[var(--neon)] transition-colors">
                  Reuse
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
