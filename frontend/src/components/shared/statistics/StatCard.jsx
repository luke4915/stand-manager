const StatCard = ({ label, value, sub }) => (
  <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{label}</p>
    <p className="text-2xl font-black tracking-tighter text-[var(--text-main)]">{value}</p>
    {sub && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</p>}
  </div>
);
export default StatCard;
