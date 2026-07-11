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
      {/* 
        Three premium thick rings touching exactly:
        strokeWidth (W) = 5.5
        radius (r) = 12.25
        Left cx = 20
        Center cx = 50
        Right cx = 80
        Outer edge meets at cx +/- (r + W/2) = cx +/- 15
      */}
      <circle
        cx="20"
        cy="18"
        r="12.25"
        stroke="currentColor"
        strokeWidth="5.5"
      />
      <circle
        cx="50"
        cy="18"
        r="12.25"
        stroke="currentColor"
        strokeWidth="5.5"
      />
      <circle
        cx="80"
        cy="18"
        r="12.25"
        stroke="currentColor"
        strokeWidth="5.5"
      />
    </svg>
  );
}
