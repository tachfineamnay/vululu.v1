/** Local composition only. No redirect service, cookies, contact identifiers or click counter. */
export function campaignLink(raw: string, source: string, campaign: string) {
  const u = new URL(raw);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    ![source, campaign].every((x) => /^[a-z0-9_-]{1,60}$/i.test(x))
  )
    throw Error('Lien HTTPS et libellés courts sans espaces requis.');
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}
