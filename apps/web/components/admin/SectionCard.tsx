import type { ReactNode } from 'react';

export default function SectionCard(input: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'admin-section-card' + (input.className ? ' ' + input.className : '')}>
      <div className="admin-section-head">
        <div>
          <h2>{input.title}</h2>
          {input.description ? <p className="admin-meta">{input.description}</p> : null}
        </div>
        {input.actions ? <div className="admin-actions">{input.actions}</div> : null}
      </div>
      {input.children}
    </section>
  );
}
