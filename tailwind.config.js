/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: '#0f1117',
          card: '#1a1d27',
          border: '#2a2d3a',
          hover: '#242736'
        },
        accent: {
          blue: '#6c8cff',
          green: '#4ade80',
          orange: '#fb923c',
          red: '#f87171',
          purple: '#a78bfa'
        }
      }
    }
  },
  plugins: []
}
