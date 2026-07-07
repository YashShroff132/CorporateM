'use client';

import { useState } from 'react';

interface CollapsibleFiltersProps {
  children: React.ReactNode;
}

export function CollapsibleFilters({ children }: CollapsibleFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile Toggle Button (hidden on desktop) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between border border-ink/20 px-4 py-3 text-xs font-bold uppercase tracking-wider bg-paper md:hidden text-ink w-full rounded transition-colors hover:bg-ink/5"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          {/* Funnel Icon */}
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          Filter &amp; Sort
        </span>
        <span className="font-mono text-sm">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Filters Content (collapsed on mobile, always visible on desktop) */}
      <div className={`${isOpen ? 'block' : 'hidden'} md:block`}>
        {children}
      </div>
    </div>
  );
}
