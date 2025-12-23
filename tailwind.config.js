/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'serif': ['Playfair Display', 'serif'],
        'sans': ['Albert Sans', 'sans-serif'],
      },
      colors: {
        'accent-gold': '#cfa15a',
      },
    },
  },
  plugins: [],
};
