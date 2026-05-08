'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * <FaqAccordion />
 *
 * Renders a list of FAQ items as a collapsible accordion. First item is
 * open by default on load; the user can toggle each item independently
 * after that (multi-open behavior — common for FAQ scanning).
 *
 * Item bodies are rendered through ReactMarkdown so authors can use
 * paragraphs, lists, links, bold/italic in answers — the same syntax that
 * works in the rest of the /app page Markdown body.
 *
 * Inputs:
 *   items — array of { question: string, answer: string (markdown) }
 *
 * Authoring (in the /app page Markdown):
 *
 *   ## ::: faq
 *
 *   ## How does it work?
 *
 *   You answer a few questions and we build a plan…
 *
 *   ## What if I don't train on a day my plan says is a training day?
 *
 *   Switch today's meal day to a rest day so your calories…
 *
 *   ## :::
 *
 * The `## ::: faq` and `## :::` lines are sentinels — they don't render.
 * Every H2 heading between them becomes a question; everything between
 * that H2 and the next H2 (or the closing `## :::`) becomes the answer.
 */

type FaqItem = { question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  // First item open on load; all others closed. Toggling is independent
  // (clicking an item only affects that item, not its siblings) — which
  // matches how readers tend to scan FAQs.
  const [openIdx, setOpenIdx] = useState<Set<number>>(() => new Set([0]));

  const toggle = (idx: number) => {
    setOpenIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="app-doc-faq" role="list">
      {items.map((item, idx) => {
        const isOpen = openIdx.has(idx);
        const panelId = `app-doc-faq-panel-${idx}`;
        const buttonId = `app-doc-faq-button-${idx}`;
        return (
          <div
            key={idx}
            role="listitem"
            className={`app-doc-faq-item ${isOpen ? 'is-open' : ''}`}
          >
            <h3 className="app-doc-faq-q">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(idx)}
                className="app-doc-faq-button"
              >
                <span className="app-doc-faq-q-text">{item.question}</span>
                <span className="app-doc-faq-chevron" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
            </h3>
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="app-doc-faq-a"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="app-doc-p">{children}</p>,
                    ul: ({ children }) => <ul className="app-doc-list">{children}</ul>,
                    ol: ({ children }) => <ol className="app-doc-list app-doc-list-numbered">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    a: ({ href, children }) => (
                      <a
                        href={href || '#'}
                        target={href && /^https?:\/\//i.test(href) ? '_blank' : undefined}
                        rel={href && /^https?:\/\//i.test(href) ? 'noopener noreferrer' : undefined}
                        className="app-doc-a"
                      >
                        {children}
                      </a>
                    ),
                    strong: ({ children }) => <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{children}</strong>,
                    em: ({ children }) => <em style={{ color: 'var(--text-2)' }}>{children}</em>,
                  }}
                >
                  {item.answer}
                </ReactMarkdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
