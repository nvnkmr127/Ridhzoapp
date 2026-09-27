import { defineConfig, devices } from '@playwright/test';

// Temporary config for the isolated local verification pass: dev server on :3100 bound to the
// throwaway local Postgres/Redis, so the user's :3000 server (remote DB) is never touched.
// Delete this file after the verification run.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'DATABASE_URL="postgresql://naveenadicharla@localhost:5432/lead_app" REDIS_URL="redis://localhost:6379" NEXTAUTH_URL="http://localhost:3100" PORT=3100 npm run dev',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
