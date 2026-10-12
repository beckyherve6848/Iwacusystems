/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff9eb',
          100: '#fef0c7',
          200: '#fedf89',
          300: '#fec84b',
          400: '#fdb022',
          500: '#f79009',
          600: '#dc6803',
          700: '#b54708',
          800: '#93370d',
          900: '#7a2e0e',
        },
        surface: {
          50:  '#f8f9fb',
          100: '#eaedf2',
          200: '#d5dbe6',
          300: '#b0bccf',
          400: '#8595ae',
          500: '#617590',
          600: '#4d5d75',
          700: '#3d4d62',
          800: '#2c3a4f',
          850: '#232f42',
          900: '#1a2434',
          925: '#131c2b',
          950: '#0d1422',
        },
        accent: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(251, 191, 36, 0.15)',
        'glow-blue': '0 0 20px rgba(14, 165, 233, 0.15)',
        'panel': '0 4px 24px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
