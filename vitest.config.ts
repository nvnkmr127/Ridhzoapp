import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig sets jsx:"preserve" for Next; override for tests so oxc (rolldown-vite) actually
  // compiles JSX (lets us render components with RTL without adding @vitejs/plugin-react).
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  test: {
    environment: 'node',
    exclude: ['node_modules', 'e2e/**'],
  },
});
