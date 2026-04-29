/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg0: '#050507',
        bg1: '#0a0a0d',
        bg2: '#111115',
        bg3: '#1a1a20',
        line: 'rgba(255,255,255,0.08)',
        line2: 'rgba(255,255,255,0.14)',
        ink: '#f4f4f6',
        ink2: 'rgba(244,244,246,0.65)',
        ink3: 'rgba(244,244,246,0.4)',
        neon: '#c4ff3d',
        neon2: '#00e5ff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        pulse: 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
