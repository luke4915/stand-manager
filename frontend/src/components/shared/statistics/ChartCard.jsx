const ChartCard = ({ title, children, action }) => (
  <div className="bg-[var(--bg-card)] rounded-xl p-5 border border-[var(--border)]">
    <div className="flex items-center justify-between mb-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
      {action}
    </div>
    {children}
  </div>
);
export default ChartCard;
