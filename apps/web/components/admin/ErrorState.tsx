export default function ErrorState(input: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="admin-error" role="alert" aria-live="assertive">
      <div>
        <strong>{input.title ?? 'Impossible de charger les donnees.'}</strong>
        <p className="admin-meta">{input.message}</p>
      </div>
      {input.onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={input.onRetry}>
          Reessayer
        </button>
      ) : null}
    </div>
  );
}
