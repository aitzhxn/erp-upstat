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
        /** Page canvas — very light cool white */
        background: '#F8FAFC',
        surface: '#FFFFFF',
        border: '#E2E8F0',
        textPrimary: '#0F172A',
        textSecondary: '#64748B',
        /** Brand blue + derived UI tokens (white/blue system) */
        primary: '#2563EB',
        primaryForeground: '#FFFFFF',
        primaryHover: '#1D4ED8',
        primarySoft: '#EFF6FF',
        primarySoftBorder: '#BFDBFE',
        /** Muted “semantic” surfaces — still blue family for consistency */
        warning: '#2563EB',
        error: '#1E40AF',
        success: '#2563EB',
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
