import type { AdminFlagStatus } from '../../lib/admin';

const FLAG_TONES: Record<AdminFlagStatus, string> = {
  CONNECTED: 'success',
  MOCK: 'warning',
  NOT_CONNECTED: 'neutral'
};

const FLAG_LABELS: Record<AdminFlagStatus, string> = {
  CONNECTED: 'CONNECTED',
  MOCK: 'MOCK',
  NOT_CONNECTED: 'NOT_CONNECTED'
};

/** Badge explicite CONNECTED / MOCK / NOT_CONNECTED : jamais de faux succes. */
export default function FlagBadge(input: { status: AdminFlagStatus; label?: string }) {
  return (
    <span
      className={'admin-badge admin-badge--' + FLAG_TONES[input.status]}
      aria-label={'Etat de connexion : ' + input.status}
    >
      {input.label ?? FLAG_LABELS[input.status]}
    </span>
  );
}
