/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sentinel: {
          ink: "#0f1c2e",
          moss: "#1f6f4a",
          sand: "#f4efe6",
          rust: "#c45c26",
        },
      },
    },
  },
  plugins: [],
};
