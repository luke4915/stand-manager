// Un numero in evidenza: etichetta piccola, valore grande con cifre allineate.
const StatCard = ({ label, value, sub }) => (
  <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
    <p className="text-xs text-[var(--text-muted)]">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-main)] truncate">{value}</p>
    {sub && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{sub}</p>}
  </div>
);
export default StatCard;
