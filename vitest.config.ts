import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Next.js supplies "server-only" at build time; it isn't an installed package, so stub it for tests.
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)) } },
  // tsconfig sets jsx:"preserve" for Next; override for tests so oxc (rolldown-vite) actually
  // compiles JSX (lets us render components with RTL without adding @vitejs/plugin-react).
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  test: {
    environment: 'node',
    exclude: ['node_modules', 'e2e/**'],
  },
});
