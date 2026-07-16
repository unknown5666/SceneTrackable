/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Map Tailwind color utilities to our CSS custom properties
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        "surface-hover": "var(--bg-surface-hover)",
        elevated: "var(--bg-elevated)",
        "border-default": "var(--border-default)",
        "border-hover": "var(--border-hover)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "sidebar-bg": "var(--sidebar-bg)",
        "chart-grid": "var(--chart-grid)",
        overlay: "var(--overlay)",
        "tooltip-bg": "var(--tooltip-bg)",
        "accent-blue": "var(--accent-blue)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        ai: "var(--color-ai)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
        button: "8px",
        badge: "6px",
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "pulse-badge": "pulseBadge 200ms ease-out",
        shake: "shake 300ms ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseBadge: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-2px)" },
          "75%": { transform: "translateX(2px)" },
        },
      },
    },
  },
  plugins: [],
};
