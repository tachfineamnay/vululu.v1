import type { ReactNode } from 'react';

export default function PageHeader(input: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-page-head">
      <div>
        {input.eyebrow ? <p className="eyebrow">{input.eyebrow}</p> : null}
        <h1>{input.title}</h1>
        {input.description ? <p className="admin-subtitle">{input.description}</p> : null}
      </div>
      {input.actions ? <div className="admin-actions">{input.actions}</div> : null}
    </div>
  );
}
