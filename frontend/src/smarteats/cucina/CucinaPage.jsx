import { useState, useEffect, useMemo } from 'react';
import { ChefHat, Clock } from 'lucide-react';
import { useKitchenOrders } from './useKitchenOrders';
import { activeOrders, upcomingByTable, urgency } from './board';

const BAR = { ok: 'bg-emerald-500', warn: 'bg-amber-500', late: 'bg-red-500' };
const TIME = { ok: 'text-[var(--text-muted)]', warn: 'text-amber-500', late: 'text-red-500' };

const Ticket = ({ order, onAdvance }) => {
  const level = urgency(order.minutes);
  const preparing = order.status === 'preparing';
  const subtitle = [order.course_name, order.covers > 0 && `${order.covers} cop.`, `#${order.display_code}`].filter(Boolean).join(' · ');
  return (
    <article className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className={`h-1 ${BAR[level]}`} />
      <header className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold text-[var(--text-main)] truncate">{order.table_name ? `Tavolo ${order.table_name}` : order.is_takeaway ? 'Asporto' : 'Banco'}</h3>
          <p className="text-sm text-[var(--text-muted)] truncate">{subtitle}</p>
        </div>
        <span className={`flex items-center gap-1 text-sm font-semibold tabular-nums shrink-0 ${TIME[level]}`}><Clock size={14} />{order.minutes} min</span>
      </header>
      <ul className="px-4 py-3 space-y-1.5 flex-1">
        {order.items.map((item, i) => (
          <li key={i}>
            <div className="flex gap-3 text-base text-[var(--text-main)]">
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{item.quantity}</span>
              <span className="min-w-0">{item.name}</span>
            </div>
            {item.note && <p className="ml-9 text-sm font-medium text-amber-500">{item.note}</p>}
          </li>
        ))}
      </ul>
      <button onClick={() => onAdvance(order, preparing ? 'completed' : 'preparing')}
        className={`h-12 text-sm font-semibold transition cursor-pointer active:scale-[0.99] ${preparing ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]' : 'border-t border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--bg-card-2)]'}`}>
        {preparing ? 'Pronta' : 'Inizia'}
      </button>
    </article>
  );
};

// Il monitor della cucina: le comande da preparare, le più vecchie per prime, ciascuna con tavolo, portata e da quanto
// aspetta. Le portate non ancora mandate si vedono in basso, così la cucina sa cosa sta per arrivare.
const CucinaPage = ({ event }) => {
  const { orders, advance } = useKitchenOrders(event);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const active = useMemo(() => activeOrders(orders ?? [], now), [orders, now]);
  const upcoming = useMemo(() => upcomingByTable(orders ?? []), [orders]);
  const preparing = active.filter(o => o.status === 'preparing').length;

  if (!orders) return <p className="text-[var(--text-muted)]">Caricamento…</p>;
  return (
    <div className="h-full flex flex-col gap-4">
      <header className="shrink-0">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Cucina</h2>
        <p className="text-sm text-[var(--text-muted)]">{active.length === 0 ? 'Nessuna comanda' : `${active.length - preparing} da preparare · ${preparing} in preparazione`}</p>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {active.length === 0
          ? <div className="h-full min-h-40 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]"><ChefHat size={32} className="opacity-40" /><p className="text-sm">Tutto in pari. Le nuove comande compaiono qui.</p></div>
          : <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start">{active.map(o => <Ticket key={o.id} order={o} onAdvance={advance} />)}</div>}
      </div>

      {upcoming.length > 0 && (
        <footer className="shrink-0 pt-3 border-t border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">In arrivo</p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(u => (
              <span key={u.table} className="px-3 py-1.5 rounded-full border border-[var(--border)] text-sm text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-main)]">{u.table}</span> · {u.courses.join(', ')}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
};

export default CucinaPage;
