/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/popup/**/*.{html,js}', './src/options/**/*.{html,js}'],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['light', 'dark'],
  },
};
