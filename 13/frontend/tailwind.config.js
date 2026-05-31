/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9fa',
          100: '#d9f0f3',
          200: '#b3e0e6',
          300: '#8dcdd9',
          400: '#4fb1c2',
          500: '#0F4C5C',
          600: '#0d4353',
          700: '#0b3a48',
          800: '#09323d',
          900: '#072832'
        },
        accent: {
          50: '#fef3ed',
          100: '#fde3d5',
          200: '#fac2a8',
          300: '#f7a17a',
          400: '#ed804d',
          500: '#E36414',
          600: '#c65812',
          700: '#a94c0f',
          800: '#8c400c',
          900: '#6f340a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'serif']
      }
    }
  },
  plugins: []
};
