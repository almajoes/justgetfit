'use client';

import { useEffect, useState, useRef } from 'react';
import type { AnalyticsSnapshot, RangeKey, TopRow } from '@/lib/analytics';

/**
 * <AnalyticsClient />
 *
 * Two snapshot panels:
 *   - LIVE — refreshed every 15 seconds via /api/admin/analytics/snapshot?range=now
 *   - RANGE — date-pill controlled (Today / Yesterday / 7d / 30d), refreshed
 *     when the user switches pills
 *
 * Initial values come server-rendered from the page (initialNow + initialRange)
 * so the dashboard is fully populated on first paint without flicker. Polling
 * starts after mount.
 *
 * Page visibility: polling pauses when the tab is hidden (document.hidden).
 * Resumes immediately on visibility change. Saves Supabase/Vercel quota and
 * isn't useful when nobody's looking at the screen.
 */

const POLL_INTERVAL_MS = 15_000;

export function AnalyticsClient({
  initialNow,
  initialRange,
}: {
  initialNow: AnalyticsSnapshot;
  initialRange: AnalyticsSnapshot;
}) {
  const [now, setNow] = useState(initialNow);
  const [range, setRange] = useState(initialRange);
  const [activeRange, setActiveRange] = useState<RangeKey>(initialRange.range);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Refs to avoid stale closures in the polling effect
  const activeRangeRef = useRef(activeRange);
  activeRangeRef.current = activeRange;

  // Real-time polling — refresh "now" data every 15s
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      if (document.hidden) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      try {
        const res = await fetch('/api/admin/analytics/snapshot?range=now', {
          cache: 'no-store',
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as AnalyticsSnapshot;
          setNow(data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('[analytics] poll failed:', err);
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // Range switch — fetches new data when user clicks a pill
  async function selectRange(newRange: RangeKey) {
    if (newRange === activeRange) return;
    setActiveRange(newRange);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/snapshot?range=${newRange}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as AnalyticsSnapshot;
        setRange(data);
      }
    } catch (err) {
      console.error('[analytics] range switch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Analytics
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 32px' }}>
        Real-time pageview tracking. All counts exclude bots.
      </p>

      {/* ─── LIVE panel ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--neon)',
              boxShadow: '0 0 0 4px rgba(196,255,61,0.2)',
              animation: 'pulse-dot 2s ease-in-out infinite',
            }}
          />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Live</h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Updated {formatTime(lastUpdated)}
          </span>
        </div>

        <div className="admin-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
          <BigStat
            label="Active visitors"
            value={now.stats.unique_visitors}
            sub="last 5 minutes"
            highlight
          />
          <BigStat
            label="Pageviews"
            value={now.stats.pageviews}
            sub="last 5 minutes"
          />
          <BigStat
            label="Active sessions"
            value={now.stats.total_sessions}
            sub="last 5 minutes"
          />
        </div>

        {now.topPaths.length > 0 && (
          <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card title="Active right now">
              <TopList rows={now.topPaths} formatLabel={formatPath} />
            </Card>
            <Card title="Last 5 minutes">
              <TimelineBars data={now.timeline} compact />
            </Card>
          </div>
        )}
      </section>

      {/* ─── Range panel ────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>History</h2>
          <div className="admin-filter-row" style={{ display: 'flex', gap: 8 }}>
            <RangePill active={activeRange === 'today'} onClick={() => selectRange('today')}>Today</RangePill>
            <RangePill active={activeRange === 'yesterday'} onClick={() => selectRange('yesterday')}>Yesterday</RangePill>
            <RangePill active={activeRange === '7d'} onClick={() => selectRange('7d')}>7 days</RangePill>
            <RangePill active={activeRange === '30d'} onClick={() => selectRange('30d')}>30 days</RangePill>
          </div>
        </div>

        <div className="admin-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16, opacity: isLoading ? 0.5 : 1, transition: 'opacity 100ms' }}>
          <BigStat label="Pageviews" value={range.stats.pageviews} />
          <BigStat label="Unique visitors" value={range.stats.unique_visitors} />
          <BigStat label="Sessions" value={range.stats.total_sessions} />
        </div>

        {/* Timeline chart */}
        <div style={{ marginBottom: 16 }}>
          <Card title={timelineTitle(activeRange)}>
            <TimelineBars data={range.timeline} />
          </Card>
        </div>

        {/* Two-column breakdowns */}
        <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Card title="Top pages">
            {range.topPaths.length === 0 ? (
              <Empty>No traffic in this range.</Empty>
            ) : (
              <TopList rows={range.topPaths} formatLabel={formatPath} />
            )}
          </Card>
          <Card title="Top referrers">
            {range.topReferrers.length === 0 ? (
              <Empty>
                {activeRange === '7d' || activeRange === '30d'
                  ? 'Switch to Today or Yesterday to see referrer breakdowns.'
                  : 'No external traffic in this range.'}
              </Empty>
            ) : (
              <TopList rows={range.topReferrers} />
            )}
          </Card>
        </div>

        <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Countries">
            {range.topCountries.length === 0 ? (
              <Empty>
                {activeRange === '7d' || activeRange === '30d'
                  ? 'Switch to Today or Yesterday to see country breakdowns.'
                  : 'No data.'}
              </Empty>
            ) : (
              <TopList rows={range.topCountries} formatLabel={formatCountry} />
            )}
          </Card>
          <Card title="Devices">
            {range.deviceBreakdown.length === 0 ? (
              <Empty>
                {activeRange === '7d' || activeRange === '30d'
                  ? 'Switch to Today or Yesterday to see device breakdowns.'
                  : 'No data.'}
              </Empty>
            ) : (
              <TopList rows={range.deviceBreakdown} formatLabel={formatDevice} />
            )}
          </Card>
        </div>
      </section>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 4px rgba(196,255,61,0.2); }
          50% { box-shadow: 0 0 0 8px rgba(196,255,61,0.05); }
        }
      `}</style>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function BigStat({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? 'rgba(196,255,61,0.06)' : 'var(--bg-1)',
        border: `1px solid ${highlight ? 'rgba(196,255,61,0.25)' : 'var(--line)'}`,
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: highlight ? 'var(--neon)' : 'var(--text)', lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function TopList({ rows, formatLabel }: { rows: TopRow[]; formatLabel?: (s: string) => string }) {
  const max = rows[0]?.count || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => {
        const label = formatLabel ? formatLabel(r.label) : r.label;
        const pct = (r.count / max) * 100;
        return (
          // Outer row — bounded by the card width; this is the scroll
          // container. overflow-x: auto + a wider inner content = swipe.
          // Mirrors how .admin-table-scroll works on the subscribers table.
          <div
            key={i}
            className="admin-toplist-row"
            style={{
              position: 'relative',
              borderRadius: 6,
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Inner content — uses min-width: max-content so the row's
                natural width is "as wide as the URL needs to be." That's
                what makes the outer container scrollable when the URL is
                longer than the card. */}
            <div
              style={{
                position: 'relative',
                padding: '6px 8px',
                minWidth: 'max-content',
                width: '100%',
              }}
            >
              {/* Bar fill (relative to inner content width) */}
              <div
                style={{
                  position: 'absolute',
                  left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: 'rgba(196,255,61,0.08)',
                  borderRadius: 6,
                  pointerEvents: 'none',
                }}
              />
              {/* Row content — label and count side by side */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  fontSize: 13,
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                <span title={label}>{label}</span>
                <span
                  style={{
                    color: 'var(--text-3)',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {r.count.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineBars({ data, compact }: { data: TopRow[]; compact?: boolean }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const height = compact ? 60 : 120;
  if (data.length === 0) {
    return <Empty>No data.</Empty>;
  }

  // Decide which bars get labels under them. Goal: ~5-7 labels visible so the
  // chart is readable but not crowded. For compact (5-bar) views, label every
  // bar. For 24-hour views, label every 4 hours. For 30-day views, label
  // every 5 days. Etc.
  const labelEvery = pickLabelInterval(data.length, compact);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, paddingBottom: 4 }}>
        {data.map((d, i) => {
          const h = (d.count / max) * (height - 4);
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div
                title={`${d.label}: ${d.count.toLocaleString()} pageviews`}
                style={{
                  width: '100%',
                  height: Math.max(2, h),
                  background: d.count > 0 ? 'var(--neon)' : 'var(--line)',
                  borderRadius: 2,
                  opacity: d.count > 0 ? 1 : 0.3,
                  transition: 'height 200ms',
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Bar-aligned labels — same flex layout as the bars above so each
          label sits directly under its column. Empty slots keep alignment for
          un-labeled bars. */}
      <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
        {data.map((d, i) => {
          // Always label first and last; otherwise every Nth.
          const showLabel = i === 0 || i === data.length - 1 || i % labelEvery === 0;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                fontSize: 10,
                color: 'var(--text-3)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
              }}
            >
              {showLabel ? d.label : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pick how often to show a label so the chart has roughly 5-7 visible labels.
 *  - compact (5-bar Live view): every bar
 *  - 24-bar (today/yesterday hourly): every 4 hours
 *  - 7-bar (7d): every bar
 *  - 30-bar (30d): every ~5 days
 */
function pickLabelInterval(length: number, compact?: boolean): number {
  if (compact) return 1;
  if (length <= 8) return 1;
  if (length <= 24) return 4;
  if (length <= 31) return 5;
  return Math.max(1, Math.floor(length / 6));
}

function RangePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 100,
        background: active ? 'rgba(196,255,61,0.1)' : 'var(--bg-1)',
        border: `1px solid ${active ? 'var(--neon)' : 'var(--line)'}`,
        color: active ? 'var(--neon)' : 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '20px 8px' }}>
      {children}
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────
function formatPath(p: string): string {
  if (p.length <= 60) return p;
  return p.slice(0, 57) + '…';
}

function formatCountry(code: string): string {
  // ISO country code → name. Small lookup table for the most common ones; for
  // anything else we just show the code. Keeps bundle size tiny.
  const names: Record<string, string> = {
    US: '🇺🇸 United States',
    CA: '🇨🇦 Canada',
    GB: '🇬🇧 United Kingdom',
    AU: '🇦🇺 Australia',
    DE: '🇩🇪 Germany',
    FR: '🇫🇷 France',
    IT: '🇮🇹 Italy',
    ES: '🇪🇸 Spain',
    NL: '🇳🇱 Netherlands',
    SE: '🇸🇪 Sweden',
    NO: '🇳🇴 Norway',
    DK: '🇩🇰 Denmark',
    IE: '🇮🇪 Ireland',
    BR: '🇧🇷 Brazil',
    MX: '🇲🇽 Mexico',
    JP: '🇯🇵 Japan',
    KR: '🇰🇷 South Korea',
    IN: '🇮🇳 India',
    SG: '🇸🇬 Singapore',
    PH: '🇵🇭 Philippines',
    NZ: '🇳🇿 New Zealand',
    ZA: '🇿🇦 South Africa',
  };
  return names[code] || code;
}

function formatDevice(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function formatTime(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return d.toLocaleTimeString();
}

function timelineTitle(range: RangeKey): string {
  if (range === 'today') return 'Pageviews by hour (today)';
  if (range === 'yesterday') return 'Pageviews by hour (yesterday)';
  if (range === '7d') return 'Pageviews by day (last 7 days)';
  if (range === '30d') return 'Pageviews by day (last 30 days)';
  return 'Timeline';
}
