/** @type {import('tailwindcss').Config} */

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        geo: {
          dark: '#1a2332',
          'dark-hover': '#243044',
          'dark-light': '#2d3a4e',
          orange: '#e87c3e',
          'orange-hover': '#d46a2d',
          gray: '#4a5568',
          green: '#38a169',
          blue: '#4299e1',
          border: '#374151',
          text: '#e2e8f0',
          'text-muted': '#94a3b8',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['"Source Sans 3"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
