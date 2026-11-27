import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ivory: 'var(--ivory)',
        oat: 'var(--oat)',
        ink: 'var(--ink)',
        espresso: 'var(--espresso)',
        terracotta: {
          DEFAULT: 'var(--terracotta)',
          dark: 'var(--terracotta-dark)',
        },
        muted: 'var(--muted)',
        border: 'var(--border)',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        photo: 'var(--shadow-photo)',
      },
      borderRadius: {
        input: '8px',
        card: '12px',
        photo: '4px',
        dialog: '16px',
      },
      maxWidth: {
        content: '1280px',
      },
    },
  },
  plugins: [],
}

export default config
