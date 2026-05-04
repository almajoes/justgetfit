'use client';

import { useMemo, useState } from 'react';

/**
 * Shared <AudiencePicker /> — used by both the Broadcast page and the
 * Publish-draft flow.
 *
 * Modes:
 *  - 'all'    → every confirmed subscriber
 *  - 'source' → all subscribers in one or more groups
 *  - 'pick'   → individually-checked subscribers (with search + bulk actions)
 *  - 'random' → seeded random sample, optionally constrained to specific groups,
 *               optionally unioned with full-include groups
 *
 * The component is CONTROLLED via the `value` prop and reports changes through
 * `onChange`. The parent owns the audience state. This lets the same picker
 * sit inside two different parent forms (broadcast / publish).
 *
 * The parent reads `value.resolvedIds` to know who to send to, and
 * `value.recipientCount` for UI display.
 */

export type Subscriber = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
  // last_sent_at is used by the picker to identify subscribers who would be
  // throttled (skipped) by the 7-day-newsletter cooldown. Optional — older
  // callers without this field will treat all subscribers as never-mailed,
  // which is safe behavior.
  last_sent_at?: string | null;
};

export type AudienceMode = 'all' | 'source' | 'pick' | 'random';

export type AudienceValue = {
  mode: AudienceMode;
  selectedSources: Set<string>;
  selectedIds: Set<string>;
  randomCount: number;
  randomFromGroups: Set<string>;
  randomFullGroups: Set<string>;
  randomSeed: number;
};

export type AudienceResolved = {
  recipients: Subscriber[];
  recipientCount: number;
  // For 'random' mode breakdown (so the parent can display the breakdown card consistently)
  sampledCount: number;
  fullIncludedCount: number;
};

export function defaultAudienceValue(): AudienceValue {
  return {
    mode: 'all',
    selectedSources: new Set(),
    selectedIds: new Set(),
    randomCount: 1000,
    randomFromGroups: new Set(),
    randomFullGroups: new Set(),
    randomSeed: Math.floor(Math.random() * 1e9),
  };
}

/**
 * Resolve the audience selection to the actual recipient list and counts.
 * Pure function so the parent can call it for display + send payload.
 *
 * Defensive: dedupes the incoming subscribers array by id first. Server-side
 * pagination with `.range()` over a non-unique sort key (e.g. `subscribed_at`)
 * can return the same row on two pages when many rows share a timestamp,
 * which would otherwise cause "picked 2 → shows 4" and "sample 1000 → shows
 * 999" bugs depending on which mode is active. We dedup once here so all the
 * downstream logic (sample pool size, Fisher-Yates, dedup loop) operates on
 * a clean unique-id array.
 */
/**
 * Resolve the audience selection to the actual recipient list and counts.
 * Pure function so the parent can call it for display + send payload.
 *
 * Defensive: dedupes the incoming subscribers array by id first. Server-side
 * pagination with `.range()` over a non-unique sort key (e.g. `subscribed_at`)
 * can return the same row on two pages when many rows share a timestamp,
 * which would otherwise cause "picked 2 → shows 4" and "sample 1000 → shows
 * 999" bugs depending on which mode is active. We dedup once here so all the
 * downstream logic (sample pool size, Fisher-Yates, dedup loop) operates on
 * a clean unique-id array.
 *
 * `throttle` parameter (default false): when true, subscribers with
 * last_sent_at within the past 7 days are filtered out BEFORE any mode
 * logic runs. Newsletter contexts (DraftEditor, ResendPanel) pass true.
 * Broadcasts pass false (intentional). Must match the throttle prop on the
 * <AudiencePicker /> for consistent behavior between picker display and
 * parent send-button count.
 */
const RESOLVE_THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

export function resolveAudience(
  subscribers: Subscriber[],
  v: AudienceValue,
  throttle = false
): AudienceResolved {
  // Dedup by id first — see comment above
  const seenIds = new Set<string>();
  const uniqueSubs: Subscriber[] = [];
  for (const s of subscribers) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      uniqueSubs.push(s);
    }
  }
  subscribers = uniqueSubs;

  // Apply 7-day throttle filter if requested (newsletter context).
  if (throttle) {
    const cutoff = Date.now() - RESOLVE_THROTTLE_MS;
    subscribers = subscribers.filter((s) => {
      const lastSent = s.last_sent_at ? new Date(s.last_sent_at).getTime() : 0;
      return lastSent <= cutoff;
    });
  }

  if (v.mode === 'all') {
    return {
      recipients: subscribers,
      recipientCount: subscribers.length,
      sampledCount: 0,
      fullIncludedCount: 0,
    };
  }
  if (v.mode === 'source') {
    if (v.selectedSources.size === 0) {
      return { recipients: [], recipientCount: 0, sampledCount: 0, fullIncludedCount: 0 };
    }
    const recipients = subscribers.filter((s) => v.selectedSources.has(s.source || '(none)'));
    return { recipients, recipientCount: recipients.length, sampledCount: 0, fullIncludedCount: 0 };
  }
  if (v.mode === 'pick') {
    const recipients = subscribers.filter((s) => v.selectedIds.has(s.id));
    return { recipients, recipientCount: recipients.length, sampledCount: 0, fullIncludedCount: 0 };
  }
  // mode === 'random'
  const samplePool =
    v.randomFromGroups.size > 0
      ? subscribers.filter(
          (s) =>
            v.randomFromGroups.has(s.source || '(none)') &&
            !v.randomFullGroups.has(s.source || '(none)')
        )
      : subscribers.filter((s) => !v.randomFullGroups.has(s.source || '(none)'));

  const n = Math.min(Math.max(0, Math.floor(v.randomCount)), samplePool.length);

  const arr = samplePool.slice();
  let seed = v.randomSeed >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const sampled = arr.slice(0, n);
  const fullIncluded =
    v.randomFullGroups.size > 0
      ? subscribers.filter((s) => v.randomFullGroups.has(s.source || '(none)'))
      : [];

  // Union, dedup by id, track per-bucket contribution for the breakdown card
  const seen = new Set<string>();
  const out: Subscriber[] = [];
  let sampledCount = 0;
  let fullIncludedCount = 0;
  for (const s of sampled) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
      sampledCount++;
    }
  }
  for (const s of fullIncluded) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
      fullIncludedCount++;
    }
  }
  return { recipients: out, recipientCount: out.length, sampledCount, fullIncludedCount };
}

export function AudiencePicker({
  subscribers: rawSubscribers,
  value,
  onChange,
  disabled,
  intro = 'Choose who receives this email. Default is everyone confirmed.',
  throttle = false,
}: {
  subscribers: Subscriber[];
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
  disabled?: boolean;
  intro?: string;
  /**
   * When true (newsletter context), subscribers with last_sent_at within the
   * past 7 days are filtered out of the picker entirely — every count, every
   * mode, every random sample pool operates on the eligible-only list. A
   * banner shows the excluded count for transparency.
   *
   * When false (broadcast context, default), the picker shows everyone — the
   * 7-day throttle does not apply to broadcasts by user policy.
   */
  throttle?: boolean;
}) {
  // Defensive dedup of incoming subscribers by id — see resolveAudience() for
  // the full explanation. Without this, pagination duplicates from the server
  // would break: pick-mode counts ("picked 2 → 4"), random-mode sample size
  // ("sample 1000 → 999"), source-mode counts in the group grids, etc.
  const dedupedSubscribers = useMemo(() => {
    const seen = new Set<string>();
    const out: Subscriber[] = [];
    for (const s of rawSubscribers) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
    return out;
  }, [rawSubscribers]);

  // Apply 7-day throttle filter (newsletters only). The filtered array is
  // what every mode below operates on, so counts, search results, and random
  // sample pools all naturally exclude throttled subscribers. The throttled
  // count is shown in a banner so the user knows the picker is showing a
  // reduced pool.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const { subscribers, throttledCount } = useMemo(() => {
    if (!throttle) {
      return { subscribers: dedupedSubscribers, throttledCount: 0 };
    }
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const eligible: Subscriber[] = [];
    let throttled = 0;
    for (const s of dedupedSubscribers) {
      const lastSent = s.last_sent_at ? new Date(s.last_sent_at).getTime() : 0;
      if (lastSent > cutoff) {
        throttled++;
      } else {
        eligible.push(s);
      }
    }
    return { subscribers: eligible, throttledCount: throttled };
  }, [dedupedSubscribers, throttle, SEVEN_DAYS_MS]);

  const [pickerSearch, setPickerSearch] = useState('');

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of subscribers) {
      const k = s.source || '(none)';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [subscribers]);

  const resolved = useMemo(() => resolveAudience(subscribers, value), [subscribers, value]);

  // Pool size for the "How many to pick" caption (excludes always-include groups)
  const randomPoolSize = useMemo(() => {
    const base =
      value.randomFromGroups.size > 0
        ? subscribers.filter((s) => value.randomFromGroups.has(s.source || '(none)'))
        : subscribers;
    return base.filter((s) => !value.randomFullGroups.has(s.source || '(none)')).length;
  }, [subscribers, value.randomFromGroups, value.randomFullGroups]);

  const randomFullSize = useMemo(() => {
    if (value.randomFullGroups.size === 0) return 0;
    return subscribers.filter((s) => value.randomFullGroups.has(s.source || '(none)')).length;
  }, [subscribers, value.randomFullGroups]);

  // ─── Update helpers (immutable) ─────────────────────────────────────
  const setMode = (m: AudienceMode) => onChange({ ...value, mode: m });
  const toggleSet = (key: 'selectedSources' | 'selectedIds' | 'randomFromGroups' | 'randomFullGroups', item: string) => {
    const next = new Set(value[key]);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange({ ...value, [key]: next });
  };

  const visiblePickerSubs = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter(
      (s) => s.email.toLowerCase().includes(q) || (s.source || '').toLowerCase().includes(q)
    );
  }, [subscribers, pickerSearch]);

  const selectAllVisible = () => {
    const next = new Set(value.selectedIds);
    for (const s of visiblePickerSubs) next.add(s.id);
    onChange({ ...value, selectedIds: next });
  };
  const deselectAllVisible = () => {
    const next = new Set(value.selectedIds);
    for (const s of visiblePickerSubs) next.delete(s.id);
    onChange({ ...value, selectedIds: next });
  };

  const reshuffle = () => onChange({ ...value, randomSeed: Math.floor(Math.random() * 1e9) });

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Audience</div>
      <p style={{ ...muted, marginBottom: 16 }}>{intro}</p>

      {/* Throttle banner — only shown when throttle=true and at least one
          subscriber is being excluded. Keeps the user informed that the
          picker is showing a reduced pool, and explains why. */}
      {throttle && throttledCount > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'rgba(255,184,77,0.08)',
            border: '1px solid rgba(255,184,77,0.25)',
            borderRadius: 8,
            color: '#ffb84d',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>{throttledCount.toLocaleString()}</strong> subscriber{throttledCount === 1 ? '' : 's'} hidden — already received a newsletter in the past 7 days (1-per-week throttle). They&apos;ll be eligible again on a rolling basis as their 7-day window passes.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <ModeBtn active={value.mode === 'all'} onClick={() => setMode('all')} disabled={disabled}>
          All confirmed ({subscribers.length.toLocaleString()})
        </ModeBtn>
        <ModeBtn active={value.mode === 'source'} onClick={() => setMode('source')} disabled={disabled}>
          By group
        </ModeBtn>
        <ModeBtn active={value.mode === 'pick'} onClick={() => setMode('pick')} disabled={disabled}>
          Pick individuals
        </ModeBtn>
        <ModeBtn active={value.mode === 'random'} onClick={() => setMode('random')} disabled={disabled}>
          Random sample
        </ModeBtn>
      </div>

      {/* BY GROUP */}
      {value.mode === 'source' && (
        <div>
          <p style={muted}>
            Each subscriber has a group label (assigned at signup or via import). Pick one or more groups
            to include.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 8,
              marginTop: 12,
            }}
          >
            {sources.map(([src, count]) => {
              const checked = value.selectedSources.has(src);
              return (
                <label
                  key={src}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: `1px solid ${checked ? 'var(--neon)' : 'var(--line)'}`,
                    borderRadius: 8,
                    background: checked ? 'rgba(196,255,61,0.06)' : 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleSet('selectedSources', src)}
                    style={{ accentColor: 'var(--neon)' }}
                  />
                  <span style={{ flex: 1, fontFamily: 'monospace' }}>{src}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{count.toLocaleString()}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* PICK INDIVIDUALS */}
      {value.mode === 'pick' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="Search by email or source…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="input"
              disabled={disabled}
              style={{ flex: 1, minWidth: 240 }}
            />
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={disabled}
              className="btn btn-ghost"
              style={smallBtn}
            >
              Select all visible
            </button>
            <button
              type="button"
              onClick={deselectAllVisible}
              disabled={disabled}
              className="btn btn-ghost"
              style={smallBtn}
            >
              Deselect all visible
            </button>
          </div>
          <div
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--bg-0)',
            }}
          >
            {visiblePickerSubs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No subscribers match.
              </div>
            ) : (
              visiblePickerSubs.map((s, i) => {
                const checked = value.selectedIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                      background: checked ? 'rgba(196,255,61,0.05)' : 'transparent',
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleSet('selectedIds', s.id)}
                      style={{ accentColor: 'var(--neon)' }}
                    />
                    <span style={{ flex: 1, fontFamily: 'monospace' }}>{s.email}</span>
                    {s.source && (
                      <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.source}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          <p style={{ ...muted, marginTop: 8 }}>
            {value.selectedIds.size.toLocaleString()} subscriber{value.selectedIds.size === 1 ? '' : 's'} selected
            {pickerSearch && ` (${visiblePickerSubs.length.toLocaleString()} match search)`}
          </p>
        </div>
      )}

      {/* RANDOM SAMPLE */}
      {value.mode === 'random' && (
        <div>
          <p style={muted}>
            Pick a random subset of subscribers, optionally combined with full groups you want to include
            entirely. Useful for warming up domain reputation, A/B testing subject lines, or sending to one
            engaged segment in full plus a sample of a larger list.
          </p>

          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 6,
              }}
            >
              How many to pick (random)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                max={Math.max(1, randomPoolSize)}
                value={value.randomCount}
                onChange={(e) => onChange({ ...value, randomCount: parseInt(e.target.value || '0', 10) || 0 })}
                className="input"
                disabled={disabled}
                style={{ width: 160 }}
              />
              <button
                type="button"
                onClick={reshuffle}
                disabled={disabled}
                className="btn btn-ghost"
                style={{ ...smallBtn, fontSize: 13 }}
              >
                ↻ Re-shuffle
              </button>
            </div>
            <p style={muted}>
              Sample pool: <strong>{randomPoolSize.toLocaleString()}</strong>
              {value.randomFromGroups.size === 0 && value.randomFullGroups.size === 0 && (
                <span style={{ color: '#ffb84d' }}> · sampling from all confirmed subscribers (no groups selected below)</span>
              )}
              {randomFullSize > 0 && (
                <>
                  {' '}· always-include: <strong>{randomFullSize.toLocaleString()}</strong>
                </>
              )}
              {value.randomFromGroups.size > 0 && ' (filtered by selected groups)'}
            </p>
          </div>

          {/* Sample-from grid */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Sample from these groups{' '}
              <span style={{ ...muted, display: 'inline', marginLeft: 4 }}>
                (leave empty to sample from <strong>all</strong> confirmed subscribers):
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}
            >
              {sources.map(([src, count]) => {
                const checked = value.randomFromGroups.has(src);
                const lockedByFull = value.randomFullGroups.has(src);
                return (
                  <label
                    key={src}
                    title={lockedByFull ? `Untick "${src}" in always-include below to sample from it instead.` : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      border: `1px solid ${checked ? 'var(--neon)' : 'var(--line)'}`,
                      borderRadius: 8,
                      background: checked ? 'rgba(196,255,61,0.06)' : 'transparent',
                      cursor: lockedByFull || disabled ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                      opacity: lockedByFull || disabled ? 0.4 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={lockedByFull || disabled}
                      onChange={() => toggleSet('randomFromGroups', src)}
                      style={{ accentColor: 'var(--neon)' }}
                    />
                    <span style={{ flex: 1, fontFamily: 'monospace' }}>{src}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{count.toLocaleString()}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Always-include grid */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Always include everyone in these groups{' '}
              <span style={{ ...muted, display: 'inline', marginLeft: 4 }}>
                (added in full on top of the random sample, deduped):
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}
            >
              {sources.map(([src, count]) => {
                const checked = value.randomFullGroups.has(src);
                const lockedBySample = value.randomFromGroups.has(src);
                return (
                  <label
                    key={src}
                    title={lockedBySample ? `Untick "${src}" in sample-from above to include it in full instead.` : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      border: `1px solid ${checked ? 'var(--neon)' : 'var(--line)'}`,
                      borderRadius: 8,
                      background: checked ? 'rgba(196,255,61,0.06)' : 'transparent',
                      cursor: lockedBySample || disabled ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                      opacity: lockedBySample || disabled ? 0.4 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={lockedBySample || disabled}
                      onChange={() => toggleSet('randomFullGroups', src)}
                      style={{ accentColor: 'var(--neon)' }}
                    />
                    <span style={{ flex: 1, fontFamily: 'monospace' }}>{src}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{count.toLocaleString()}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Breakdown card — uses ACTUAL computed contributions, not independently
              recalculated numbers. Sum is mathematically guaranteed to equal recipientCount. */}
          {(randomFullSize > 0 || value.randomCount > 0) && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--line)',
                fontSize: 12,
                color: 'var(--text-2)',
                lineHeight: 1.6,
              }}
            >
              Final recipients:{' '}
              <strong style={{ color: 'var(--neon)' }}>{resolved.recipientCount.toLocaleString()}</strong>
              {' '}={' '}
              <strong>{resolved.sampledCount.toLocaleString()}</strong> random
              {resolved.fullIncludedCount > 0 && (
                <>
                  {' '}+ <strong>{resolved.fullIncludedCount.toLocaleString()}</strong> always-included
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Local styling helpers (kept colocated so this component is portable) ───
function ModeBtn({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        border: `1px solid ${active ? 'var(--neon)' : 'var(--line-2)'}`,
        background: active ? 'var(--neon)' : 'transparent',
        color: active ? '#000' : 'var(--text-2)',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

const card: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-3)',
  marginTop: 6,
  lineHeight: 1.5,
};

const smallBtn: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
};
