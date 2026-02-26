/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#00D4FF",
        secondary: "#7C3AED",
        accent: "#F59E0B",
        danger: "#EF4444",
        success: "#10B981",
        warning: "#F97316",
        bg: {
          900: "#0A0A0F",
          800: "#111118",
          700: "#1A1A24",
          600: "#22222E",
          500: "#2A2A38",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        pulse_fast: "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
        slide_in: "slideIn 0.3s ease-out",
        count_up: "countUp 0.5s ease-out",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #00D4FF33" },
          "100%": { boxShadow: "0 0 20px #00D4FF88, 0 0 40px #00D4FF44" },
        },
        slideIn: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        countUp: {
          "0%": { transform: "scale(1.2)", color: "#00D4FF" },
          "100%": { transform: "scale(1)", color: "inherit" },
        },
      },
    },
  },
  plugins: [],
};
