import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import type { AccountMail } from '../../apps/api/src/infrastructure/email/accountMail';

const initial = 'A test-only passphrase';
const changed = 'Another test-only passphrase';
async function emailLink(email: string, route: string, index = 0) {
  let link = '';
  await expect.poll(async () => {
    const file = await readFile(process.env.F01_TEST_MAILBOX!, 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return '';
      throw e;
    });
    const mail = file.split('\n').filter(Boolean).map((line) => JSON.parse(line) as AccountMail)
      .filter((message) => message.to === email && message.text.includes(`/${route}#`))[index];
    link = mail?.text.split('\n')[2] || '';
    return !!link;
  }).toBe(true);
  return link;
}
async function signIn(page: Page, email: string, password: string) {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}
async function newPassword(page: Page, password: string) {
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
}
async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('self-registers, starts a marketing project, and recovers account access', async ({ page, browser, baseURL }) => {
  const email = `${randomUUID()}@f01-browser.example`;
  await page.goto('/login');
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await fitsViewport(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Email').press('Enter');
  await expect(page.getByRole('status')).toContainText('Si cette adresse est éligible');
  await page.getByRole('link', { name: 'Demander un nouveau lien' }).click();
  await expect(page).toHaveURL(/\/resend-verification$/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('status')).toContainText('Si cette adresse est éligible');
  await page.goto(await emailLink(email, 'verify-email', 1));
  await fitsViewport(page);
  await page.getByLabel('Votre nom').fill('Customer Browser');
  await newPassword(page, initial);
  await expect(page.getByRole('status')).toContainText('Adresse vérifiée');
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await signIn(page, email, initial);

  await expect(page.getByRole('heading', { name: 'Créez votre profil d’activité' })).toBeVisible();
  await page.getByTestId('context-name').fill('Studio Indigo');
  await page.getByTestId('context-description').fill('Independent brand design studio.');
  await page.getByTestId('context-submit').click();
  await page.getByLabel('Nom de l’offre').fill('Identité visuelle');
  await page.getByRole('button', { name: 'Confirmer et créer un projet' }).click();
  await page.getByTestId('project-title').fill('Ma première campagne');
  await page.getByTestId('project-objective').fill('Présenter mon service de design.');
  await page.getByTestId('project-next').click();
  await expect(page.getByTestId('project-context').locator('option:checked')).toHaveText('Studio Indigo');
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-submit').click();
  await expect(page).toHaveURL(/\/projects\/(?!new)[^?]+\?offer=/);
  await page.getByText('Assistant marketing · plan de la semaine').click();
  await expect(page.getByLabel('Offre confirmée').locator('option:checked')).toHaveText('Identité visuelle');

  const secondary = await browser.newContext({ baseURL });
  try {
    const anotherPage = await secondary.newPage();
    await anotherPage.goto('/login');
    await signIn(anotherPage, email, initial);
    await expect(anotherPage).toHaveURL(/\/$/);
    await page.goto('/account');
    await page.getByRole('link', { name: 'Profil et sécurité' }).click();
    await fitsViewport(page);
    await page.getByLabel('Votre nom').fill('Customer Updated');
    await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
    await expect(page.getByRole('status')).toContainText('Votre profil a été enregistré');
    await page.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
    await expect(page.getByRole('status')).toContainText('Les autres appareils ont été déconnectés');
    expect((await secondary.request.get('/api/auth/me')).status()).toBe(401);
    await page.getByLabel('Mot de passe actuel').fill(initial);
    await newPassword(page, 'Password changed in the browser');
    await expect(page.getByRole('status')).toContainText('Mot de passe modifié');
    await page.getByRole('button', { name: 'Me déconnecter ici' }).click();
  } finally { await secondary.close(); }

  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('status')).toContainText('Si cette adresse est éligible');
  const resetLink = await emailLink(email, 'reset-password');
  await page.goto(resetLink);
  await fitsViewport(page);
  await newPassword(page, changed);
  await expect(page.getByRole('status')).toContainText('Mot de passe modifié');
  await page.goto(resetLink);
  await newPassword(page, initial);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalide ou expiré');
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await signIn(page, email, changed);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Ma première campagne').first()).toBeVisible();
});
