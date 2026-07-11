import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink)',
        paper: 'var(--color-paper)',
        corporate: '#1E3A5F',
        highlighter: 'var(--color-highlighter)',
        'stamp-red': '#E5322D',
        muted: 'var(--color-muted)',
        success: '#1DB954',
        error: '#E5322D',
      },
    },
  },
  plugins: [],
};

export default config;
