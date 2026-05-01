/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F1F5F9',
        surface: '#FFFFFF',
        border: '#E2E8F0',
        textPrimary: '#0F172A',
        textSecondary: '#64748B',
        primary: '#2563EB',
        warning: '#D97706',
        error: '#DC2626',
        success: '#16A34A',
        sidebar: {
          bg: '#0F172A',
          border: '#1E293B',
          text: '#94A3B8',
          textActive: '#FFFFFF',
          active: '#1D4ED8',
          hover: '#1E293B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      spacing: {
        'base': '8px',
      },
      borderRadius: {
        'base': '8px',
        'lg': '10px',
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
