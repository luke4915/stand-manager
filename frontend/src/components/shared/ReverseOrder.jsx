import React, { useEffect, useState, useCallback } from 'react';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { useToast } from '../../context/useToast';

import { fetchWithAuth } from '../../utils/apiClient';
const CANCEL_WINDOW_MS = 5 * 60 * 1000; // deve combaciare con il backend

// Un ordine è stornabile se: è ancora pending/preparing (avanzata, sempre stornabile
// finché non è completato) oppure è 'completed' ma senza completed_at (modalità
// semplice, mai passato dalla cucina) ed è entro 5 minuti dalla creazione.
const cancelDeadline = (order) => {
  if (order.status === 'pending' || order.status === 'preparing') return Infinity;
  if (order.status === 'completed' && !order.completed_at) {
    return new Date(order.created_at).getTime() + CANCEL_WINDOW_MS;
  }
  return -Infinity; // non stornabile
};

const ReverseOrder = ({ onClose }) => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const data = await fetchWithAuth('/orders?session=active');
      setOrders(data.filter(o => cancelDeadline(o) > Date.now()));
    } catch {
      showToast("Errore caricamento ordini", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Tick ogni secondo: aggiorna i countdown e fa sparire gli ordini appena scadono
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const visibleOrders = orders.filter(o => cancelDeadline(o) > now);

  const cancelOrder = async (orderId) => {
    try {
      await fetchWithAuth(`/orders/${orderId}`, { method: 'PUT', body: { status: 'canceled' } });
      setOrders(prev => prev.filter(o => o.id !== orderId));
      showToast("Ordine stornato", "success");
    } catch (err) {
      showToast(`Errore durante lo storno: ${err.message}`, "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-card)] rounded-3xl shadow-2xl p-6 w-full max-w-lg border border-[var(--border)]">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-black tracking-tighter text-[var(--text-main)]">Storno Ordini</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
              Pending (avanzata) o completati da meno di 5 min (semplice)
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-card-2)] transition-colors">
            <X size={18} className="text-[var(--text-muted)]" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">Caricamento...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="py-10 text-center text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">Nessun ordine da stornare</div>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto no-scrollbar">
            {visibleOrders.map(order => {
              const deadline = cancelDeadline(order);
              const isTimed = Number.isFinite(deadline);
              const secsLeft = isTimed ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

              return (
                <li key={order.id} className="flex justify-between items-center p-4 bg-[var(--bg-card-2)] rounded-2xl border border-[var(--border)]">
                  <div>
                    <span className="font-black text-sm uppercase tracking-tight text-[var(--text-main)]">Ordine #{order.id}</span>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {order.items?.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                    </div>
                    <div className="text-xs font-black text-[var(--accent)] mt-0.5">{Number(order.total || 0).toFixed(2)} €</div>
                    {isTimed && (
                      <div className="flex items-center gap-1 text-[10px] font-black text-orange-400 mt-1">
                        <Clock size={10} /> Scade tra {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => cancelOrder(order.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                  >
                    <AlertTriangle size={12} /> Storna
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ReverseOrder;
