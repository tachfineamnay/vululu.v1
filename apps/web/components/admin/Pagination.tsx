export default function Pagination(input: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, input.totalPages);
  const page = Math.min(Math.max(1, input.page), totalPages);
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <p className="admin-meta">
        Page {page} / {totalPages}
        {typeof input.total === 'number' ? ' - ' + input.total + ' resultat(s)' : ''}
        {input.pageSize ? ' - ' + input.pageSize + ' par page' : ''}
      </p>
      <div className="admin-actions">
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => input.onPageChange(page - 1)}
          disabled={input.disabled === true || page <= 1}
          aria-label="Page precedente"
        >
          Precedent
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => input.onPageChange(page + 1)}
          disabled={input.disabled === true || page >= totalPages}
          aria-label="Page suivante"
        >
          Suivant
        </button>
      </div>
    </nav>
  );
}
