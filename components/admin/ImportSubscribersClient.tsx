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

/**
 * Extract emails from a raw CSV/TSV/text file into a newline-separated string.
 *
 * Strategy:
 *   1. If the first row looks like a header (contains "email" case-insensitive in any column),
 *      use that column index for every following row.
 *   2. Otherwise, scan EVERY cell on EVERY row and keep anything that looks like an email.
 *
 * Handles:
 *   - Mailchimp / Substack / ConvertKit exports (header + email column + extra columns)
 *   - Plain single-column lists (just emails)
 *   - TSV (tab-separated) and SSV (semicolon-separated) — common in non-US locales
 *   - Quoted fields like "Last, First",alice@x.com (treats quoted commas as part of the value)
 */
function extractEmailsFromCSV(raw: string): string {
  // Split into lines, ignore blank lines
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  // Detect the field separator: pick whichever of comma/tab/semicolon appears most in the first line
  const first = lines[0];
  const counts: Record<string, number> = {
    ',': (first.match(/,/g) || []).length,
    '\t': (first.match(/\t/g) || []).length,
    ';': (first.match(/;/g) || []).length,
  };
  const sep = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as string) || ',';

  // Parse a single line into fields, respecting double-quoted values containing the separator
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ''));
  };

  const headerCells = parseLine(lines[0]);
  const emailColIdx = headerCells.findIndex((c) => /email/i.test(c));

  const collected: string[] = [];

  if (emailColIdx >= 0 && lines.length > 1) {
    // Header detected — pull from the email column on rows 2..N
    for (let r = 1; r < lines.length; r++) {
      const cells = parseLine(lines[r]);
      const cell = cells[emailColIdx];
      if (cell && EMAIL_REGEX.test(cell.toLowerCase())) {
        collected.push(cell.toLowerCase());
      }
    }
  } else {
    // No header found — scan every cell on every line, keep anything that looks like an email
    for (const line of lines) {
      const cells = parseLine(line);
      for (const cell of cells) {
        if (cell && EMAIL_REGEX.test(cell.toLowerCase())) {
          collected.push(cell.toLowerCase());
        }
      }
    }
  }

  // Dedup before returning so the user sees a clean preview
  return Array.from(new Set(collected)).join('\n');
}

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
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const parsed = useMemo(() => parseEmails(text), [text]);
  const canImport = parsed.valid.length > 0 && !importing;

  // Read a dropped/selected file, find the email column, dump emails into the textarea.
  // Works with single-column files (just emails) and multi-column CSVs (e.g. Mailchimp/Substack
  // export with email,name,subscribed_at,...). For multi-column we look for a header containing
  // "email" — case-insensitive — and pull that column.
  function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const extracted = extractEmailsFromCSV(raw);
      setText(extracted);
    };
    reader.onerror = () => setError(`Could not read file: ${file.name}`);
    reader.readAsText(file);
  }

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

      {/* Group label */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Group label</label>
        <input
          className="input"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. mailchimp-april or gym-owners-cold"
          style={{ maxWidth: 360 }}
        />
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          Tags every imported subscriber with this label so you can filter, broadcast, or relabel them later.
          Shows up in the &ldquo;Group&rdquo; column on the subscribers list. Use something distinct like
          &ldquo;mailchimp-april&rdquo; or &ldquo;import-batch-1&rdquo;.
        </p>
      </div>

      {/* CSV file upload */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Upload a CSV file</label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          style={{
            border: `1px dashed ${dragActive ? 'var(--neon)' : 'var(--line-2)'}`,
            background: dragActive ? 'rgba(196,255,61,0.05)' : 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            padding: 24,
            textAlign: 'center',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            style={{ display: 'none' }}
            id="csv-file-input"
          />
          <label
            htmlFor="csv-file-input"
            style={{
              display: 'inline-block',
              padding: '8px 18px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--line-2)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Choose CSV file
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
            …or drag &amp; drop a CSV here. Auto-detects the email column from the header row.
            {fileName && (
              <>
                <br />
                <span style={{ color: 'var(--neon)' }}>✓ Loaded: {fileName}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Paste box */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">…or paste email addresses</label>
        <textarea
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder="alice@example.com&#10;bob@example.com&#10;carol@example.com"
          style={{ fontFamily: 'var(--mono, monospace)', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
        />
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          One email per line, or comma/semicolon-separated.
        </p>
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
              setFileName(null);
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
