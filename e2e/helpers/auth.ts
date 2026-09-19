import { Page, expect } from '@playwright/test';

export async function loginAsUser(
  page: Page,
  email: string = 'admin@ridhzo.com',
  password: string = 'password123'
) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}
