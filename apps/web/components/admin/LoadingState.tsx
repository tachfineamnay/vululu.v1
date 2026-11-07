export default function LoadingState(input: { label?: string }) {
  return (
    <div className="admin-loading" role="status" aria-live="polite">
      <span className="admin-spinner" aria-hidden="true" />
      <span>{input.label ?? 'Chargement...'}</span>
    </div>
  );
}
