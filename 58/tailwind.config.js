/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        base: {
          950: '#050b1c',
          900: '#0b1e3f',
          800: '#102a54',
          700: '#153a72',
        },
        accent: {
          cyan: '#00d4ff',
          orange: '#ff8a00',
          danger: '#ff3b3b',
          success: '#22d3a1',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'system-ui', 'sans-serif'],
        sans: ['HarmonyOS Sans', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 18px rgba(0, 212, 255, 0.45)',
        danger: '0 0 14px rgba(255, 59, 59, 0.45)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: 0.5 },
          '50%': { opacity: 1 },
        },
      },
      animation: {
        pulseSoft: 'pulseSoft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
