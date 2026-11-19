import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login?next=/calendar');
  await page.getByLabel('Email', { exact: true }).fill(process.env.DEMO_EMAIL!);
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL((url) => url.pathname === '/calendar');
}

test('weekly plan survives edits, archive, logout and login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/contexts/new');
  const name = 'Atelier ' + Date.now();
  await page.getByTestId('context-name').fill(name);
  await page.getByTestId('context-description').fill('Cours de dessin pour les débutants.');
  await page.getByTestId('context-submit').click();
  await expect(page).toHaveURL(/\/contexts\?context=/);
  const contextId = new URL(page.url()).searchParams.get('context')!;
  const ids = await page.evaluate(
    async ({ contextId, name }) => {
      const token = decodeURIComponent(
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('vululu_csrf='))!
          .split('=')[1]
      );
      async function send(path: string, data: unknown, method = 'POST') {
        const res = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Fixture request failed: ' + path + ' ' + res.status);
        return res.json();
      }
      const { campaign } = await send('/api/campaigns', { name });
      const { project } = await send('/api/projects', {
        contextId,
        title: name,
        platform: 'LinkedIn',
        format: 'Carrousel',
        objective: 'Remplir le cours'
      });
      await send('/api/projects/' + project.id + '/campaign', { campaignId: campaign.id }, 'PUT');
      return { project: project.id, campaign: campaign.id };
    },
    { contextId, name }
  );
  await page.goto('/projects/' + ids.project);
  await page.getByRole('link', { name: 'Planifier ce projet' }).click();
  const confirm = page.getByText('Confirmer une offre de votre activité');
  await expect(confirm).toBeVisible();
  if (!(await page.getByLabel('Nom de l’offre').isVisible())) await confirm.click();
  await page.getByRole('combobox', { name: 'Marque' }).selectOption({ label: name });
  await page.getByLabel('Nom de l’offre').fill(name);
  await page.getByRole('button', { name: 'Confirmer l’offre' }).click();
  const titles: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.getByText('Suggestions hebdomadaires', { exact: false }).click();
    await page
      .getByRole('button', {
        name: new RegExp(['Présenter :', 'Expliquer :', 'Inviter à découvrir :'][i] + ' ' + name)
      })
      .click();
    titles.push(await page.getByLabel('Titre', { exact: true }).inputValue());
    await expect(page.getByRole('combobox', { name: 'Campagne', exact: true })).toHaveValue(ids.campaign);
    await expect(page.getByRole('link', { name: 'Ouvrir le projet dans le Studio' })).toHaveAttribute(
      'href',
      '/projects/' + ids.project
    );
    await expect(page.getByLabel('Objectif marketing')).toHaveValue('Remplir le cours');
    await page.getByLabel('Public cible').fill('Débutants');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('button', { name: titles[i], exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: titles[0], exact: true }).click();
  await page.getByLabel('État éditorial').selectOption('DRAFT');
  const date = page.getByLabel(/Date et heure/);
  const moved = (await date.inputValue()).slice(0, 11) + '15:30';
  await date.fill(moved);
  await page.getByLabel('Titre', { exact: true }).fill(name + ' révisé');
  await page.getByRole('button', { name: 'Ajouter une plateforme' }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const edited = page.getByRole('button', { name: name + ' révisé', exact: true });
  await expect(edited).toBeVisible();
  const duplicated = page.getByRole('article').filter({ has: edited });
  await duplicated.getByRole('button', { name: 'Dupliquer' }).click();
  const copy = await page.getByLabel('Titre', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('button', { name: copy, exact: true }).click();
  await page.getByLabel('Archivé', { exact: true }).check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Préparer la semaine' })).toBeVisible();
  await expect(page.getByLabel('Archives uniquement')).toBeChecked();
  await expect(page.getByRole('button', { name: copy, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sortir', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await login(page);
  await expect(edited).toBeVisible();
  await edited.click();
  await expect(page.getByLabel(/Date et heure/)).toHaveValue(moved);
  await expect(page.getByRole('combobox', { name: 'Plateforme', exact: true })).toHaveCount(2);
  await page.getByText('Historique · version 2').click();
  await expect(page.getByText('v1 · ' + titles[0], { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  for (const title of titles.slice(1))
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Vue', exact: true }).selectOption('month');
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 1440 || width === 390)
      await page.screenshot({ path: test.info().outputPath(`calendar-${width}.png`) });
  }
  // Archive dates may be in the adjacent month on a boundary week.
  await page.getByRole('combobox', { name: 'Vue', exact: true }).selectOption('week');
  await page.getByLabel('Archives uniquement').check();
  await expect(page.getByRole('button', { name: copy, exact: true })).toBeVisible();
});
