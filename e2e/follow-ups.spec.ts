import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Follow-Ups & Reminder System', () => {
  test.setTimeout(60000);

  test('should authenticate, navigate to follow-ups, and verify pending follow-ups dashboard', async ({ page }) => {
    // 1. Authenticate
    await loginAsUser(page);

    // 2. Navigate to /follow-ups
    await page.goto('/follow-ups');

    // 3. Verify Page Title and Metrics Cards
    await expect(page.locator('h1', { hasText: 'Follow-ups' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('div', { hasText: 'Later today' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Overdue' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Upcoming' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Done this week' }).first()).toBeVisible();

    // 4. Verify NotificationBell trigger exists
    const bellButton = page.locator('button:has(.lucide-bell), button[aria-label="Notifications"]');
    await expect(bellButton.first()).toBeVisible();
  });
});
