import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Admin & Settings E2E', () => {
  test.setTimeout(60000);

  test('should authenticate and access settings page', async ({ page }) => {
    await loginAsUser(page);

    await page.goto('/settings');

    await expect(page.locator('h1, h2', { hasText: /Settings/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('should access user management settings page', async ({ page }) => {
    await loginAsUser(page);

    await page.goto('/settings/users');

    await expect(page.locator('h1, h2', { hasText: /Team members|Users/i }).first()).toBeVisible({ timeout: 15000 });
  });
});
