import { test, expect } from '@playwright/test';

test.describe('Follow-Ups & Reminder System', () => {
  test.setTimeout(60000);

  test('should authenticate, navigate to follow-ups, and verify pending follow-ups dashboard', async ({ page }) => {
    // 1. Authenticate
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });

    await page.fill('input[type="email"]', 'admin@ridhzo.com');
    await page.fill('input[type="password"]', 'password123');

    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 2. Navigate to /follow-ups
    await page.goto('/follow-ups');

    // 3. Verify Page Title and Metrics Cards
    await expect(page.locator('h1', { hasText: 'My Follow-ups' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('div', { hasText: 'Due Today' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Overdue' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Upcoming' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Completed' }).first()).toBeVisible();

    // 4. Verify NotificationBell trigger exists
    const bellButton = page.locator('button:has(.lucide-bell), button[aria-label="Notifications"]');
    await expect(bellButton.first()).toBeVisible();
  });
});
