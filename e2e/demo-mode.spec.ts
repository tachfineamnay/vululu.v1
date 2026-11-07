import { test, expect } from '@playwright/test';

test('mode demo explicite sans identifiants pre-remplis ni dependance IA', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toHaveValue('');
  await expect(page.getByTestId('login-password')).toHaveValue('');
  if (process.env.DEMO_MODE === '1') {
    await expect(page.getByRole('note', { name: 'Mode demonstration' })).toContainText('IA simulée');
    await expect(page.getByRole('note', { name: 'Mode demonstration' })).toContainText('Postiz');
  } else {
    await expect(page.getByRole('note', { name: 'Mode demonstration' })).toHaveCount(0);
  }
  await page.getByTestId('login-email').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('login-password')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('login-submit')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
