import { useState } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { formatEuro } from './checkMath';
import { label, card } from './ui';

const STATUS = {
  pending: ['In attesa', 'text-amber-500 border-amber-500/40 bg-amber-500/10'],
  preparing: ['In preparazione', 'text-sky-500 border-sky-500/40 bg-sky-500/10'],
  completed: ['Servita', 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10'],
  canceled: ['Stornata', 'text-red-500 border-red-500/40 bg-red-500/10'],
};
const time = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

// Comande del conto con le loro righe. Una comanda in attesa o in preparazione si può stornare (finché il conto è aperto).
const CheckOrders = ({ detail, onChanged }) => {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(null);
  const open = detail.status === 'open';

  const cancel = async (order) => {
    try {
      await fetchWithAuth(`/orders/${order.id}`, { method: 'PUT', body: { status: 'canceled' } });
      showToast('Comanda stornata', 'info');
    } catch (err) { showToast(err.message, 'error'); }
    setConfirming(null);
    onChanged();
  };

  if (!detail.orders.length) return <p className="text-sm text-[var(--text-muted)]">Nessuna comanda: aggiungine una per iniziare.</p>;

  return (
    <div className="space-y-3">
      {detail.orders.map(order => {
        const [text, style] = STATUS[order.status] ?? [order.status, ''];
        const canceled = order.status === 'canceled';
        return (
          <article key={order.id} className={`${card} ${canceled ? 'opacity-60' : ''}`}>
            <header className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-black text-sm text-[var(--text-main)]">Comanda #{order.display_code}</span>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">{time(order.created_at)}</span>
              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${style}`}>{text}</span>
              <span className="ml-auto text-sm font-black tabular-nums text-[var(--text-main)]">{formatEuro(order.total)}</span>
            </header>
            <ul className="space-y-1">
              {order.items.map(item => (
                <li key={item.line_id ?? item.name} className="flex items-baseline gap-2 text-sm">
                  <span className={`flex-1 min-w-0 text-[var(--text-main)] ${canceled ? 'line-through' : ''}`}>
                    {item.quantity}× {item.name}
                    {item.note && <span className="block text-xs text-[var(--text-muted)]">» {item.note}</span>}
                  </span>
                  {!canceled && item.paid_quantity > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{item.remaining_quantity === 0 ? 'pagata' : `${item.paid_quantity}/${item.quantity} pagate`}</span>
                  )}
                  {item.type !== 'sale' && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">{item.type === 'gift' ? 'omaggio' : 'sconto'}</span>}
                  <span className="tabular-nums text-[var(--text-muted)]">{formatEuro(item.line_total)}</span>
                </li>
              ))}
            </ul>
            {open && ['pending', 'preparing'].includes(order.status) && (
              <div className="mt-3 flex justify-end gap-2">
                {confirming === order.id ? (
                  <>
                    <button className="text-xs font-black text-[var(--text-muted)]" onClick={() => setConfirming(null)}>Annulla</button>
                    <button className="text-xs font-black text-red-500" onClick={() => cancel(order)}>Conferma storno</button>
                  </>
                ) : <button className={`${label} hover:text-red-500`} onClick={() => setConfirming(order.id)}>Storna comanda</button>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default CheckOrders;
