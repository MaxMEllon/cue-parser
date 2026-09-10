/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // 実体は app/globals.css のトークン。ここは Tailwind から参照するための別名で、
      // 値は持たせない(melocil.de と揃えるときに触るのは globals.css の側だけ)
      colors: {
        bg: 'var(--bg)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        panel: 'var(--panel)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}
