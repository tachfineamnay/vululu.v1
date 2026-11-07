/**
 * Graphique en barres SVG maison (aucune librairie graphique).
 * Accessible : role img + resume textuel des valeurs.
 */
export default function BarChart(input: {
  title: string;
  data: Array<{ label: string; value: number }>;
  tone?: 'primary' | 'accent' | 'success' | 'danger';
  emptyLabel?: string;
}) {
  const tone = input.tone ?? 'primary';
  const rows = input.data.filter((item) => item.value > 0);
  const max = rows.reduce((current, item) => Math.max(current, item.value), 0);
  const rowHeight = 26;
  const labelWidth = 132;
  const barArea = 210;
  const valueSpace = 46;
  const width = labelWidth + barArea + valueSpace;
  const height = Math.max(rows.length * rowHeight + 8, 40);
  const summary = rows.map((item) => item.label + ' : ' + item.value).join(', ');

  return (
    <div className="admin-chart">
      <h3 className="admin-chart-title">{input.title}</h3>
      {rows.length === 0 ? (
        <p className="admin-empty">{input.emptyLabel ?? 'Aucune donnee.'}</p>
      ) : (
        <svg
          className="admin-chart-svg"
          viewBox={'0 0 ' + width + ' ' + height}
          role="img"
          aria-label={input.title + '. ' + summary}
        >
          {rows.map((row, index) => {
            const y = index * rowHeight + 4;
            const barWidth = Math.max(3, Math.round((row.value / Math.max(1, max)) * barArea));
            return (
              <g key={row.label}>
                <text className="admin-chart-label" x={0} y={y + 16}>
                  {row.label}
                </text>
                <rect
                  className={'admin-chart-bar admin-chart-bar--' + tone}
                  x={labelWidth}
                  y={y + 4}
                  width={barWidth}
                  height={rowHeight - 10}
                  rx={5}
                />
                <text className="admin-chart-value" x={labelWidth + barWidth + 6} y={y + 16}>
                  {row.value}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
