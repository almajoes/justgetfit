'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Strict-enough email regex — rejects obvious garbage but doesn't try to be RFC perfect.
// Anything that fails this would also fail in delivery, so no point being more permissive.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParsedList = {
  valid: string[];        // unique, lowercased, deduped
  invalid: string[];      // lines that didn't look like emails
  duplicatesInInput: number; // count of dupes within the pasted text itself
};

function parseEmails(text: string): ParsedList {
  const lines = text
    .split(/[\n,;]+/)        // split on newline, comma, semicolon
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicatesInInput = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!EMAIL_REGEX.test(lower)) {
      invalid.push(line);
      continue;
    }
    if (seen.has(lower)) {
      duplicatesInInput += 1;
      continue;
    }
    seen.add(lower);
    valid.push(lower);
  }

  return { valid, invalid, duplicatesInInput };
}

type ImportResult = {
  inserted: number;
  alreadyExisted: number;
  errors: string[];
};

export function ImportSubscribersClient() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [source, setSource] = useState('import');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseEmails(text), [text]);
  const canImport = parsed.valid.length > 0 && !importing;

  async function runImport() {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/subscribers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: parsed.valid, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data as ImportResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/subscribers" style={{ color: 'var(--text-2)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to subscribers
        </Link>
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
        Import subscribers
      </h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Paste a list of opted-in email addresses below — one per line, or comma-separated.
        Imported subscribers are marked as <strong>confirmed immediately</strong> (no confirmation
        email sent), so only paste people who have already opted in to your list.
      </p>

      {/* Source label */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Source label (for tracking)</label>
        <input
          className="input"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="import"
          style={{ maxWidth: 280 }}
        />
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          Shows up in the &ldquo;Source&rdquo; column on the subscribers list. Use something like
          &ldquo;import-2026-04&rdquo; or &ldquo;mailchimp-export&rdquo; to remember where they came from.
        </p>
      </div>

      {/* Paste box */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Email addresses</label>
        <textarea
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder="alice@example.com&#10;bob@example.com&#10;carol@example.com"
          style={{ fontFamily: 'var(--mono, monospace)', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
        />
      </div>

      {/* Live preview summary */}
      {text.trim() && (
        <div
          style={{
            marginBottom: 24,
            padding: '14px 18px',
            borderRadius: 10,
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <Stat label="Ready to import" value={parsed.valid.length} accent="var(--neon)" />
            {parsed.duplicatesInInput > 0 && (
              <Stat label="Duplicates in input" value={parsed.duplicatesInInput} accent="var(--text-3)" />
            )}
            {parsed.invalid.length > 0 && (
              <Stat label="Invalid (skipped)" value={parsed.invalid.length} accent="#ff9b6b" />
            )}
          </div>

          {parsed.invalid.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-3)' }}>
                Show invalid lines
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 6,
                  fontSize: 11,
                  maxHeight: 160,
                  overflow: 'auto',
                  color: 'var(--text-2)',
                }}
              >
                {parsed.invalid.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: 'rgb(252,165,165)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginBottom: 16,
            padding: '16px 20px',
            borderRadius: 10,
            background: 'rgba(196,255,61,0.07)',
            border: '1px solid rgba(196,255,61,0.3)',
            color: 'var(--neon)',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Import complete</div>
          <div style={{ color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--neon)' }}>{result.inserted}</strong> new subscriber{result.inserted === 1 ? '' : 's'} imported
            {result.alreadyExisted > 0 && (
              <>, <strong>{result.alreadyExisted}</strong> already in list (skipped)</>
            )}
            {result.errors.length > 0 && (
              <>, <strong style={{ color: '#ff9b6b' }}>{result.errors.length}</strong> failed</>
            )}.
          </div>
          {result.errors.length > 0 && (
            <details style={{ marginTop: 8, color: 'var(--text-2)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12 }}>Show errors</summary>
              <pre style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
                {result.errors.join('\n')}
              </pre>
            </details>
          )}
          <div style={{ marginTop: 12 }}>
            <Link href="/admin/subscribers" style={{ color: 'var(--neon)', textDecoration: 'underline', fontSize: 13 }}>
              View subscribers →
            </Link>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={runImport}
          disabled={!canImport}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: 14 }}
        >
          {importing
            ? `Importing ${parsed.valid.length}…`
            : parsed.valid.length === 0
            ? 'Paste emails to begin'
            : `Import ${parsed.valid.length} subscriber${parsed.valid.length === 1 ? '' : 's'}`}
        </button>
        {text && !importing && (
          <button
            onClick={() => {
              setText('');
              setResult(null);
              setError(null);
            }}
            className="btn btn-ghost"
            style={{ padding: '12px 20px', fontSize: 13 }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}
