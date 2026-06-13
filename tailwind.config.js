/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'tire-good':   '#22c55e',
        'tire-fair':   '#eab308',
        'tire-poor':   '#f97316',
        'tire-danger': '#ef4444',
        'dark-bg':      '#0f0f1a',
        'dark-surface': '#1a1a2e',
        'dark-card':    '#252540'
      }
    }
  },
  plugins: []
};
