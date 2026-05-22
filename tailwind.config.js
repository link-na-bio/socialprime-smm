/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#3b82f6", // Premium Blue
                "primary-hover": "#2563eb",
                "background-light": "#f6f7f8",
                "background-dark": "#0B1120", // Darker premium background
                "surface-dark": "#161E2E", // Slightly lighter for cards
                "card-dark": "#1F2937",
                "border-dark": "#374151",
                "text-secondary": "#9CA3AF",
            },
            fontFamily: {
                display: ["Spline Sans", "sans-serif"],
                body: ["Noto Sans", "sans-serif"],
            },
        },
        animation: {
            'float': 'float 6s ease-in-out infinite',
            'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
        },
        keyframes: {
            float: {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-20px)' },
            },
            fadeInUp: {
                '0%': { opacity: '0', transform: 'translateY(20px)' },
                '100%': { opacity: '1', transform: 'translateY(0)' },
            },
        },
    },
    plugins: [],
}
