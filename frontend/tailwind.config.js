/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F6F3',
        surface: '#FFFFFF',
        'surface-subtle': '#FAFAF8',
        border: '#E3E3DE',
        'border-subtle': '#ECECE8',
        'text-primary': '#1A1A1A',
        'text-secondary': '#5C5C57',
        'text-tertiary': '#8A8A84',
        accent: {
          DEFAULT: '#2F5D8A',
          hover: '#264A6E',
          subtle: '#EDF3F8',
        },
        status: {
          healthy: '#2E7D4F',
          'healthy-bg': '#EDF6F0',
          watch: '#A66A00',
          'watch-bg': '#FEF7ED',
          critical: '#B3402F',
          'critical-bg': '#FDF2F0',
          unknown: '#7A7A75',
          'unknown-bg': '#F4F4F2',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '4px',
        md: '6px',
        lg: '6px',
        xl: '6px',
        '2xl': '6px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
