/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0a0a0a",
          muted: "#525252",
          faint: "#a3a3a3",
        },
        paper: {
          DEFAULT: "#fafafa",
          warm: "#f5f5f5",
          border: "#e5e5e5",
        },
        brand: {
          DEFAULT: "#6d4aff",
          soft: "#a78bfa",
          glow: "#ec4899",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        chill: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
        glow: "0 8px 30px rgba(109,74,255,0.18)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #6d4aff 0%, #ec4899 100%)",
      },
    },
  },
  plugins: [],
};
