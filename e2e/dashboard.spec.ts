import { test, expect } from '@playwright/test';

test.describe('Executive Dashboard', () => {
  test.setTimeout(60000);

  test('should authenticate and render the real executive dashboard', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Wait for email input to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });

    // Fill credentials
    await page.fill('input[type="email"]', 'admin@ridhzo.com');
    await page.fill('input[type="password"]', 'password123');
    
    // Submit form and allow auth session to settle
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Navigate to Executive Dashboard
    await page.goto('/');

    // Check main heading
    await expect(page.locator('h2', { hasText: 'Executive Dashboard' })).toBeVisible({ timeout: 15000 });

    // Check KPI Cards
    await expect(page.locator('div', { hasText: 'Total Leads' }).first()).toBeVisible();
    await expect(page.locator('div', { hasText: 'Conversion Rate' }).first()).toBeVisible();

    // Check Real Chart Titles
    await expect(page.locator('h3', { hasText: 'Leads by Source' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Pipeline Distribution' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Lead Distribution by Owner' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Recent Activity' })).toBeVisible();

    // Verify Recharts rendering containers
    const charts = page.locator('.recharts-responsive-container');
    await expect(charts).toHaveCount(3);
  });
});
