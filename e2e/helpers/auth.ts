import { Page, type BrowserContext } from '@playwright/test';

// One UI login per worker process. The app's auth guard rate-limits logins per email
// (8 per 15 min), which parallel specs each doing their own UI login would blow through —
// so the first login's session cookie is cached and replayed for the rest of the worker's tests.
let cachedCookies: Awaited<ReturnType<BrowserContext['storageState']>>['cookies'] | null = null;

export async function loginAsUser(
  page: Page,
  email: string = 'admin@acme.com',
  password: string = 'password123'
) {
  if (cachedCookies) {
    await page.context().addCookies(cachedCookies);
    return;
  }
  await page.goto('/login');
  // The login page opens on the WhatsApp OTP tab; email/password lives behind the Email tab.
  await page.getByRole('tab', { name: 'Email' }).click();
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  cachedCookies = (await page.context().storageState()).cookies;
}
