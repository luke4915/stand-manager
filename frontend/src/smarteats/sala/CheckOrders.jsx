import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { formatEuro } from './checkMath';
import { iconBtn } from './ui';

const STATUS = { pending: ['In attesa', 'text-amber-500'], preparing: ['In preparazione', 'text-sky-500'], completed: ['Servita', 'text-emerald-500'], canceled: ['Stornata', 'text-red-500'] };
const time = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

// Le righe del conto, raggruppate per comanda (come le righe del carrello alla cassa).
// Una comanda in attesa o in preparazione si può stornare finché il conto è aperto.
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

  if (!detail.orders.length) {
    return <p className="h-full flex items-center justify-center text-center text-[var(--text-muted)] opacity-50 font-black uppercase tracking-widest text-xs py-10">Nessuna comanda</p>;
  }

  return detail.orders.map(order => {
    const isCover = order.order_type === 'cover';
    if (isCover && order.status === 'canceled') return null;   // coperto tolto: nessuna traccia da mostrare
    const [text, tone] = STATUS[order.status] ?? [order.status, ''];
    const canceled = order.status === 'canceled';
    return (
      <section key={order.id} className={`space-y-1.5 ${canceled ? 'opacity-50' : ''}`}>
        {!isCover && <div className="flex items-center gap-2 px-1 pt-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">#{order.display_code} · {time(order.created_at)}</span>
          <span className={`text-[10px] font-black uppercase tracking-widest ${tone}`}>{text}</span>
          {open && ['pending', 'preparing'].includes(order.status) && (
            <span className="ml-auto flex items-center gap-1.5">
              {confirming === order.id ? (
                <>
                  <button className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]" onClick={() => setConfirming(null)}>No</button>
                  <button className="text-[10px] font-black uppercase tracking-widest text-red-500" onClick={() => cancel(order)}>Storna</button>
                </>
              ) : <button className={`${iconBtn} !p-1`} title="Storna la comanda" aria-label={`Storna la comanda ${order.display_code}`} onClick={() => setConfirming(order.id)}><Undo2 size={14} /></button>}
            </span>
          )}
        </div>}
        {order.items.map(item => {
          const paid = item.paid_quantity > 0;
          return (
            <div key={item.line_id ?? item.name} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)]">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="bg-[var(--accent)] text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded shrink-0">{item.quantity}</span>
                  <span className={`font-bold text-xs uppercase text-[var(--text-main)] leading-tight truncate ${canceled ? 'line-through' : ''}`}>{item.name}</span>
                  {!canceled && item.type !== 'sale' && <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${item.type === 'gift' ? 'bg-purple-500/10 text-purple-500' : 'bg-orange-500/10 text-orange-500'}`}>{item.type === 'gift' ? 'Omaggio' : 'Sconto'}</span>}
                  {!canceled && paid && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">{item.remaining_quantity === 0 ? 'Pagata' : `${item.paid_quantity}/${item.quantity} pagate`}</span>}
                </div>
                <span className="font-black text-xs tabular-nums text-[var(--text-main)] shrink-0">{formatEuro(item.line_total)}</span>
              </div>
              {item.note && <p className="mt-1 ml-7 text-[11px] text-[var(--text-muted)]">» {item.note}</p>}
            </div>
          );
        })}
      </section>
    );
  });
};

export default CheckOrders;
