import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#F5F5F0',
        corporate: '#1E3A5F',
        highlighter: '#D9FF00',
        'stamp-red': '#E5322D',
        muted: '#6B6B6B',
        success: '#1DB954',
        error: '#E5322D',
      },
    },
  },
  plugins: [],
};

export default config;
