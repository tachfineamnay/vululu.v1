// Civil calendar arithmetic uses local midnights, never 24-hour increments.
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localInput = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function shift(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
export function period(anchor: Date, monthly: boolean) {
  const start = monthly
    ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    : shift(anchor, -((anchor.getDay() + 6) % 7));
  const end = monthly ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : shift(start, 7);
  const days: Date[] = [];
  for (let d = start; d < end; d = shift(d, 1)) days.push(d);
  return { start, end, days };
}
export function instants(local: string) {
  const d = new Date(local);
  if (!Number.isFinite(+d) || localInput(d) !== local) return [];
  // Resolve a repeated civil minute using the following day's UTC offset.
  const delta = shift(d, 1).getTimezoneOffset() - d.getTimezoneOffset();
  const later = new Date(+d + delta * 60000);
  return delta > 0 && localInput(later) === local ? [d, later] : [d];
}
