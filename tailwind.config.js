/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff9f6',
          100: '#d7f1e9',
          200: '#b0e3d3',
          300: '#7fceb8',
          400: '#4bb39a',
          500: '#2b9880',
          600: '#1f7a67',
          700: '#1c6254',
          800: '#1a4f45',
          900: '#17423a',
        },
        ink: {
          50: '#f5f6f7',
          100: '#e8eaed',
          200: '#cfd3d9',
          300: '#a7aeb8',
          400: '#788293',
          500: '#5a6577',
          600: '#454f60',
          700: '#38404e',
          800: '#262c37',
          900: '#181c24',
        },
      },
    },
  },
  plugins: [],
}
