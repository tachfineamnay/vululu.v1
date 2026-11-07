import type { ReactNode } from 'react';

export default function MetricCard(input: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  badge?: ReactNode;
}) {
  const tone = input.tone ?? 'default';
  return (
    <div className={'admin-metric admin-metric--' + tone}>
      <span className="admin-metric-label">{input.label}</span>
      <div className="admin-metric-value-row">
        <span className="admin-metric-value">{input.value}</span>
        {input.badge}
      </div>
      {input.hint ? <span className="admin-metric-hint">{input.hint}</span> : null}
    </div>
  );
}
