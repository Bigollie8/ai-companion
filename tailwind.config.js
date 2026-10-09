/** @type {import('tailwindcss').Config} */
// Colours resolve to the design tokens declared on :root in src/renderer/index.css,
// so the retained detail components recolour with the theme without edits.
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        gray: {
          200: 'var(--text-strong)',
          300: 'var(--text)',
          400: 'var(--muted)',
          500: 'var(--muted)',
          600: 'var(--faint)',
          700: 'var(--line)',
          800: 'var(--raised)'
        },
        purple: { 500: 'rgb(167 139 250 / <alpha-value>)' },
        blue: { 500: 'rgb(196 181 253 / <alpha-value>)' },
        panel: {
          bg: 'var(--ground)',
          card: 'var(--panel)',
          border: 'var(--line)',
          hover: 'var(--raised)'
        },
        accent: {
          blue: 'var(--attention)',
          green: 'var(--codex)',
          orange: 'var(--claude)',
          red: 'var(--warn)',
          purple: 'var(--accent)'
        }
      }
    }
  },
  plugins: []
}
