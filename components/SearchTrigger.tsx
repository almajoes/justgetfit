'use client';

import { SEARCH_OPEN_EVENT } from './SearchOverlay';

/**
 * <SearchTrigger />
 *
 * Search icon button. Click → dispatches the `jgf:open-search` window event
 * which the (singleton) <SearchOverlay /> listens for. This indirection lets
 * us render the trigger button in multiple places (desktop nav, mobile
 * actions row, footer, etc.) while only mounting one overlay.
 */
export function SearchTrigger() {
  function handleClick() {
    window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT));
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Search articles"
      className="search-trigger"
      title="Search (⌘K)"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </button>
  );
}
