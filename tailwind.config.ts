import type { Config } from "tailwindcss";

const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", md: "1.5rem", xl: "2rem" },
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0052D4",
          foreground: "#FFFFFF",
          hover: "#0043AD",
          soft: "#EFF6FF",
        },
        secondary: { DEFAULT: "#4364F7", foreground: "#FFFFFF" },
        background: "#F8FAFC",
        surface: "#FFFFFF",
        foreground: "#0F172A",
        muted: { DEFAULT: "#F1F5F9", foreground: "#475569" },
        border: "#E2E8F0",
        ring: "#0052D4",
        accent: {
          DEFAULT: "#F59E0B",
          foreground: "#451A03",
          soft: "#FFFBEB",
        },
        success: { DEFAULT: "#15803D", soft: "#F0FDF4" },
        warning: { DEFAULT: "#92400E", soft: "#FFFBEB" },
        danger: { DEFAULT: "#B91C1C", soft: "#FEF2F2" },
      },
      fontFamily: {
        sans: ["var(--font-sans, Arial)", "sans-serif"],
        arabic: ["var(--font-arabic, Tahoma)", "sans-serif"],
      },
      spacing: {
        sidebar: "17rem",
        "bottom-nav": "4.5rem",
        "safe-top": "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 0px)",
        "mobile-content": "calc(4.5rem + env(safe-area-inset-bottom, 0px) + 1rem)",
      },
      minHeight: { screen: "100dvh", touch: "2.75rem" },
      borderRadius: { card: "1.25rem" },
      boxShadow: {
        card: "0 4px 24px -8px rgb(15 23 42 / 0.12)",
        navigation: "0 -4px 24px rgb(15 23 42 / 0.06)",
      },
      backgroundImage: {
        "nour-gradient": "linear-gradient(135deg, #0052D4 0%, #4364F7 100%)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out both",
        "slide-up": "slide-up 240ms ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
