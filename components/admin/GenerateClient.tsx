'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Topic } from '@/lib/supabase';

/**
 * <GenerateClient />
 *
 * Manual draft-generation UI on /admin/generate. Lists every unused topic
 * in the queue with a checkbox; the admin selects which topics they want
 * articles for, hits "Generate", and the client makes one POST per
 * selected topic to /api/admin/batch-generate. Each request passes the
 * selected topic's `topicId` so the API uses that exact topic instead of
 * picking randomly.
 *
 * Helper buttons:
 *   - "Random N" — selects N random topics from the list (replaces any
 *     prior selection). For when you don't care which topics, just want
 *     N drafts.
 *   - "Select all" / "Clear" — quick toggles.
 *
 * Filters: dropdown to narrow by category. Selection persists across
 * filter changes (you can pick from one category, switch to another, pick
 * more, then generate the combined set).
 *
 * Empty queue: shows the "no topics yet" CTA with a button that calls
 * /api/admin/topics/generate to seed 8 fresh topics.
 */

type ProgressItem = {
  topicId: string;
  topicTitle: string;
  status: 'pending' | 'success' | 'error';
  resultTitle?: string;  // set on success — the draft's actual title
  error?: string;
};

const RANDOM_PRESETS = [3, 5, 10];

export function GenerateClient({ unusedTopics }: { unusedTopics: Topic[] }) {
  const router = useRouter();
  const total = unusedTopics.length;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [done, setDone] = useState(false);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  // Distinct categories for the filter dropdown. Sorted alphabetically so
  // the dropdown order is stable as new topics arrive.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of unusedTopics) set.add(t.category);
    return Array.from(set).sort();
  }, [unusedTopics]);

  const visibleTopics = useMemo(() => {
    if (categoryFilter === 'all') return unusedTopics;
    return unusedTopics.filter((t) => t.category === categoryFilter);
  }, [unusedTopics, categoryFilter]);

  const selectedCount = selectedIds.size;
  const canRun = selectedCount > 0 && !running;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const t of visibleTopics) next.add(t.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function pickRandom(n: number) {
    // Pick from VISIBLE topics so respecting the category filter is intuitive.
    // Replaces any prior selection — this is a "give me N at random" gesture,
    // not an additive one.
    const pool = [...visibleTopics];
    const k = Math.min(n, pool.length);
    // Fisher-Yates shuffle, take first k
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setSelectedIds(new Set(pool.slice(0, k).map((t) => t.id)));
  }

  async function generateTopics() {
    setGeneratingTopics(true);
    setTopicError(null);
    try {
      const res = await fetch('/api/admin/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 8 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setTopicError(err instanceof Error ? err.message : 'Topic generation failed');
    } finally {
      setGeneratingTopics(false);
    }
  }

  async function runDraftBatch() {
    // Build the order from the current selection. We iterate over
    // unusedTopics so the order matches the queue order (oldest first),
    // but only include selected ones.
    const selectedTopics = unusedTopics.filter((t) => selectedIds.has(t.id));
    if (selectedTopics.length === 0) return;

    setRunning(true);
    setDone(false);
    const initial: ProgressItem[] = selectedTopics.map((t) => ({
      topicId: t.id,
      topicTitle: t.title,
      status: 'pending',
    }));
    setProgress(initial);

    for (let i = 0; i < selectedTopics.length; i++) {
      const t = selectedTopics[i];
      try {
        const res = await fetch('/api/admin/batch-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId: t.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setProgress((prev) =>
          prev.map((p) =>
            p.topicId === t.id
              ? { ...p, status: 'success', resultTitle: data.title || t.title }
              : p
          )
        );
      } catch (err) {
        setProgress((prev) =>
          prev.map((p) =>
            p.topicId === t.id
              ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
              : p
          )
        );
      }
    }

    setRunning(false);
    setDone(true);
    // Clear selection so the user doesn't accidentally re-generate the
    // same set on the next click. The page is also refreshed so the
    // (now-used) topics drop off the list automatically.
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
        Generate articles
      </h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Pick which topics you want articles for, then hit Generate. Each draft lands in{' '}
        <Link href="/admin/drafts" style={{ color: 'var(--neon)' }}>Drafts</Link> for review before
        publishing. Each article takes ~30–60 seconds. Keep this tab open while generating.
      </p>

      {total === 0 ? (
        <EmptyTopicsCTA
          generatingTopics={generatingTopics}
          onGenerate={generateTopics}
          error={topicError}
        />
      ) : (
        <div
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          {/* Toolbar: filter + bulk-select helpers */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 16,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label
                htmlFor="cat-filter"
                style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}
              >
                Category
              </label>
              <select
                id="cat-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                disabled={running}
                className="input"
                style={{ padding: '6px 10px', fontSize: 13, minWidth: 140 }}
              >
                <option value="all">All ({total})</option>
                {categories.map((c) => {
                  const count = unusedTopics.filter((t) => t.category === c).length;
                  return (
                    <option key={c} value={c}>
                      {c} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 0 }} />

            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Quick pick:</span>
            {RANDOM_PRESETS.filter((n) => n <= visibleTopics.length).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pickRandom(n)}
                disabled={running}
                style={ghostButton(running)}
              >
                Random {n}
              </button>
            ))}
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={running || visibleTopics.length === 0}
              style={ghostButton(running)}
            >
              Select all{categoryFilter !== 'all' ? ` (${visibleTopics.length})` : ''}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={running || selectedCount === 0}
              style={ghostButton(running)}
            >
              Clear
            </button>
          </div>

          {/* Topic list */}
          {visibleTopics.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No topics in this category. Switch category or{' '}
              <Link href="/admin/topics" style={{ color: 'var(--neon)' }}>add some</Link>.
            </div>
          ) : (
            <div
              style={{
                maxHeight: 420,
                overflowY: 'auto',
                border: '1px solid var(--line)',
                borderRadius: 8,
              }}
            >
              {visibleTopics.map((t, i) => (
                <TopicRow
                  key={t.id}
                  topic={t}
                  selected={selectedIds.has(t.id)}
                  disabled={running}
                  onToggle={() => toggle(t.id)}
                  isLast={i === visibleTopics.length - 1}
                />
              ))}
            </div>
          )}

          {/* Generate button + summary */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              {selectedCount === 0 ? (
                <>Select at least one topic to generate.</>
              ) : (
                <>
                  <strong style={{ color: 'var(--text)' }}>{selectedCount}</strong> topic
                  {selectedCount === 1 ? '' : 's'} selected · ~{Math.round(selectedCount * 0.75)}–
                  {selectedCount} min total
                </>
              )}
            </p>
            <button
              onClick={runDraftBatch}
              disabled={!canRun}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: 14 }}
            >
              {running
                ? `Generating ${progress.filter((p) => p.status !== 'pending').length} of ${progress.length}…`
                : `Generate ${selectedCount} draft${selectedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {progress.length > 0 && <ProgressList items={progress} />}

      {done && (
        <div
          style={{
            marginTop: 24,
            padding: 24,
            background: 'rgba(196,255,61,0.05)',
            border: '1px solid rgba(196,255,61,0.2)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--neon)', fontWeight: 600, marginBottom: 8 }}>
            Batch generation complete
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            {progress.filter((p) => p.status === 'success').length} succeeded,{' '}
            {progress.filter((p) => p.status === 'error').length} failed.
          </p>
          <Link
            href="/admin/drafts"
            className="btn btn-ghost"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            Go to drafts →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function TopicRow({
  topic,
  selected,
  disabled,
  onToggle,
  isLast,
}: {
  topic: Topic;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--line)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: selected ? 'rgba(196,255,61,0.05)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        style={{
          marginTop: 3,
          accentColor: 'var(--neon)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          width: 16,
          height: 16,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: topic.angle ? 4 : 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text)',
              lineHeight: 1.4,
            }}
          >
            {topic.title}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 100,
              background: 'rgba(196,255,61,0.10)',
              color: 'var(--neon)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}
          >
            {topic.category}
          </span>
        </div>
        {topic.angle && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {topic.angle}
          </div>
        )}
      </div>
    </label>
  );
}

function EmptyTopicsCTA({
  generatingTopics,
  onGenerate,
  error,
}: {
  generatingTopics: boolean;
  onGenerate: () => void;
  error: string | null;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 32,
        marginBottom: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 12 }}>💡</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No topics in the queue</h2>
      <p
        style={{
          color: 'var(--text-2)',
          marginBottom: 24,
          fontSize: 14,
          lineHeight: 1.6,
          maxWidth: 480,
          margin: '0 auto 24px',
        }}
      >
        Add some topic ideas before you can generate articles. The fastest way is to let Claude
        suggest a fresh batch — they'll cover all 8 categories and avoid duplicates.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onGenerate}
          disabled={generatingTopics}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: 14 }}
        >
          {generatingTopics ? 'Generating 8 topics…' : '✨ Generate 8 topics with AI'}
        </button>
        <Link
          href="/admin/topics"
          className="btn btn-ghost"
          style={{
            padding: '12px 24px',
            fontSize: 14,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Or add manually →
        </Link>
      </div>
      {error && <p style={{ marginTop: 16, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}
    </div>
  );
}

function ProgressList({ items }: { items: ProgressItem[] }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 8,
        maxHeight: 480,
        overflowY: 'auto',
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.topicId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none',
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 12,
              background:
                item.status === 'success'
                  ? 'rgba(196,255,61,0.15)'
                  : item.status === 'error'
                  ? 'rgba(255,107,107,0.15)'
                  : 'rgba(255,255,255,0.05)',
              color:
                item.status === 'success'
                  ? 'var(--neon)'
                  : item.status === 'error'
                  ? '#ff6b6b'
                  : 'var(--text-3)',
            }}
          >
            {item.status === 'success' ? '✓' : item.status === 'error' ? '✕' : '·'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text)', fontWeight: 500 }}>
              {item.resultTitle || item.topicTitle}
            </div>
            {item.error && (
              <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>{item.error}</div>
            )}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color:
                item.status === 'success'
                  ? 'var(--neon)'
                  : item.status === 'error'
                  ? '#ff6b6b'
                  : 'var(--text-3)',
            }}
          >
            {item.status === 'success' ? 'done' : item.status === 'error' ? 'error' : 'queued'}
          </span>
        </div>
      ))}
    </div>
  );
}

function ghostButton(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    color: 'var(--text-2)',
    border: '1px solid var(--line-2)',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };
}
