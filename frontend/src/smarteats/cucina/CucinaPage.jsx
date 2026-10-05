import { useState, useEffect, useMemo } from 'react';
import { ChefHat, Clock, Check } from 'lucide-react';
import { useKitchenOrders } from './useKitchenOrders';
import { boardOrders, upcomingByTable, urgency, ticketAction, toggleLineStatus, isDone, STATIONS } from './board';
import { segment, segmentBox } from '../sala/ui';

const BAR = { ok: 'bg-emerald-500', warn: 'bg-amber-500', late: 'bg-red-500' };
const TIME = { ok: 'text-[var(--text-muted)]', warn: 'text-amber-500', late: 'text-red-500' };

const Ticket = ({ order, onLines }) => {
  const level = urgency(order.minutes);
  const action = ticketAction(order);
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
      <ul className="px-2 py-2 flex-1">
        {order.items.map(item => {
          const done = isDone(item);
          return (
            <li key={item.line_id}>
              <button onClick={() => onLines(order, [item.line_id], toggleLineStatus(item))} aria-label={`${item.name}: ${done ? 'pronta, torna in preparazione' : 'segna pronta'}`}
                className="w-full flex gap-3 items-start px-2 py-1.5 rounded-md text-left hover:bg-[var(--bg-card-2)] cursor-pointer">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[var(--border-hover)]'}`}>{done && <Check size={13} />}</span>
                <span className={`min-w-0 text-base ${done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-main)]'}`}>
                  <span className="font-semibold tabular-nums mr-2">{item.quantity}</span>{item.name}
                  {item.modifiers?.length > 0 && <span className="block text-sm text-[var(--text-muted)]">{item.modifiers.map(m => m.name).join(', ')}</span>}
                  {item.note && <span className="block text-sm font-medium text-amber-500 no-underline">{item.note}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button onClick={() => onLines(order, action.lineIds, action.status)}
        className={`h-12 text-sm font-semibold transition cursor-pointer active:scale-[0.99] ${action.status === 'ready' ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]' : 'border-t border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--bg-card-2)]'}`}>
        {action.label}
      </button>
    </article>
  );
};

// Il monitor della cucina: le comande da preparare, le più vecchie per prime, ciascuna con tavolo, portata e da quanto
// aspetta. Le portate non ancora mandate si vedono in basso, così la cucina sa cosa sta per arrivare.
const CucinaPage = ({ event }) => {
  const { orders, setLines } = useKitchenOrders(event);
  const [station, setStation] = useState('all');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const active = useMemo(() => boardOrders(orders ?? [], station, now), [orders, station, now]);
  const upcoming = useMemo(() => upcomingByTable(orders ?? []), [orders]);
  const preparing = active.filter(o => o.items.some(i => i.prep_status === 'preparing')).length;

  if (!orders) return <p className="text-[var(--text-muted)]">Caricamento…</p>;
  return (
    <div className="h-full flex flex-col gap-4">
      <header className="shrink-0 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Cucina</h2>
          <p className="text-sm text-[var(--text-muted)]">{active.length === 0 ? 'Nessuna comanda' : `${active.length - preparing} da preparare · ${preparing} in preparazione`}</p>
        </div>
        <div className={`${segmentBox} w-64`} role="tablist" aria-label="Postazione">
          {STATIONS.map(s => <button key={s.id} role="tab" aria-selected={station === s.id} className={segment(station === s.id)} onClick={() => setStation(s.id)}>{s.label}</button>)}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {active.length === 0
          ? <div className="h-full min-h-40 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]"><ChefHat size={32} className="opacity-40" /><p className="text-sm">Tutto in pari. Le nuove comande compaiono qui.</p></div>
          : <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start">{active.map(o => <Ticket key={o.id} order={o} onLines={setLines} />)}</div>}
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
