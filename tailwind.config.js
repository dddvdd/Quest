/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic role identity tokens — used for accents, badges,
        // active states and role sections. Never as full-page paint.
        role: {
          jobseeker: '#2563eb',
          employer: '#7c3aed',
          staff: '#d97706',
          supervisor: '#db2777',
          medical: '#059669',
          admin: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}
