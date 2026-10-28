import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit tests cover the logic in src/lib and src/i18n. Pages, components and
// the browser-only animation and drawing helpers are left to manual checks;
// keep this list the same as sonar.coverage.exclusions.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/i18n/**'],
      exclude: ['src/lib/motion.js', 'src/lib/reveal.js', 'src/lib/glide.js', 'src/lib/confirmationImage.js'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
