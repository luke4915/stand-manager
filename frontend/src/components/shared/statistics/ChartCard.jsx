const ChartCard = ({ title, children, action }) => (
  <section className="bg-[var(--bg-card)] rounded-xl p-5 border border-[var(--border)]">
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);
export default ChartCard;
