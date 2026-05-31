/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{svelte,js,ts,html}'],
  theme: {
    extend: {
      colors: {
        'deep-blue': '#0A1628',
        'deep-blue-light': '#0F2038',
        'deep-blue-lighter': '#162D50',
        'cyber-cyan': '#00E5FF',
        'cyber-cyan-dim': '#00A0B5',
        'signal-green': '#00E096',
        'signal-yellow': '#FFB800',
        'alert-red': '#FF3D71',
        'panel-bg': '#0C1E36',
        'panel-border': '#1A3A5C',
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        body: ['Source Sans 3', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'flow-particle': 'flow-particle 3s linear infinite',
        'scroll-alert': 'scroll-alert 20s linear infinite',
        'fade-in': 'fade-in 0.5s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0,229,255,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(0,229,255,0.6)' },
        },
        'flow-particle': {
          '0%': { strokeDashoffset: '20' },
          '100%': { strokeDashoffset: '0' },
        },
        'scroll-alert': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
