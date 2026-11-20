import { logEvent } from '../../observability/logger';

export type AccountMail = { to: string; subject: string; text: string };
export type AccountMailTransport = { send(message: AccountMail): Promise<void> };

export function configuredAccountMail(): AccountMailTransport | null {
  const apiKey = process.env.ACCOUNT_EMAIL_RESEND_API_KEY;
  const from = process.env.ACCOUNT_EMAIL_FROM;
  if (!apiKey && !from) return null;
  if (!apiKey || !from) throw new Error('Configuration email de compte incomplète.');
  return {
    async send(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, ...message }),
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('Account email rejected');
    }
  };
}

export function accountEmailOrigin(): string {
  const configured = process.env.ACCOUNT_EMAIL_ORIGIN;
  const production = process.env.APP_ENV === 'production';
  const url = new URL(configured || (production ? '' : 'http://localhost:3100'));
  if (url.href !== url.origin + '/' || (url.protocol !== 'https:' && (production || url.protocol !== 'http:'))) {
    throw new Error('ACCOUNT_EMAIL_ORIGIN doit être une origine web publique, HTTPS en production.');
  }
  return url.origin;
}

export function deliverAccountLink(transport: AccountMailTransport, origin: string, to: string, purpose: 'verify' | 'reset', token: string) {
  const verify = purpose === 'verify';
  const link = new URL(verify ? '/verify-email' : '/reset-password', origin);
  // Fragments are not sent to web servers, proxies or in referrers.
  link.hash = new URLSearchParams({ token }).toString();
  const subject = verify ? 'Vululu — Vérifiez votre adresse email' : 'Vululu — Réinitialisez votre mot de passe';
  const text = `${subject}\n\n${link.href}\n\nCe lien à usage unique expire ${verify ? 'dans 24 heures' : 'dans 30 minutes'}. Si vous n’êtes pas à l’origine de la demande, ignorez ce message.`;
  // Provider latency/failure must not change the public response for eligible addresses.
  setImmediate(() => {
    void Promise.resolve().then(() => transport.send({ to, subject, text })).catch(() => {
      logEvent('error', 'auth.account_email_delivery_failed', { purpose });
    });
  });
}
