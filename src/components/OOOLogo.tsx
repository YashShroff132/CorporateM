import React from 'react';

interface OOOLogoProps {
  className?: string;
}

export function OOOLogo({ className = 'h-6 w-auto' }: OOOLogoProps) {
  return (
    <svg
      viewBox="0 0 100 36"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Three overlapping rings to simulate the OOO logo graphic */}
      <circle
        cx="28"
        cy="18"
        r="13.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <circle
        cx="50"
        cy="18"
        r="13.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <circle
        cx="72"
        cy="18"
        r="13.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
    </svg>
  );
}
