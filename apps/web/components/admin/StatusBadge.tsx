import { statusLabel, statusTone } from '../../lib/admin';

/** Badge de statut generique, mappe sur les tonalites du design system. */
export default function StatusBadge(input: { status: string; label?: string; title?: string }) {
  const tone = statusTone(input.status);
  return (
    <span className={'admin-badge admin-badge--' + tone} title={input.title}>
      {input.label ?? statusLabel(input.status)}
    </span>
  );
}
