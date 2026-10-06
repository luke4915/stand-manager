import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/useToast';
import { listFailedOrders, retryFailedOrder, discardFailedOrder } from '../../offline/failedOrders';

// Ordini battuti offline che il server ha rifiutato per sempre (es. sessione chiusa da più di 24 ore):
// restano in cassa finché non si decide cosa farne. Riprova li rimanda; Elimina li toglie per sempre.
const formatTime = (iso) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50';

const FailedOrdersModal = ({ onClose, onChanged }) => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setOrders(await listFailedOrders()), []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, localId) => {
    setBusy(true);
    try { await action(localId); await load(); onChanged?.(); }
    catch (err) { showToast(`Operazione non riuscita: ${err.message}`, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)] flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Ordini non sincronizzati</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Il server li ha rifiutati. Verifica in cassa se vanno registrati a mano, poi toglili dall'elenco.</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 rounded-xl hover:bg-[var(--bg-card-2)]"><X size={18} className="text-[var(--text-muted)]" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          {!orders && <p className="text-sm text-[var(--text-muted)]">Caricamento…</p>}
          {orders?.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nessun ordine da controllare.</p>}
          {orders?.map(o => (
            <div key={o.localId} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-sm text-[var(--text-main)]">{o.displayCode ? `Ordine ${o.displayCode}` : 'Ordine offline'}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{formatTime(o.createdAt)}{o.total != null && ` · € ${Number(o.total).toFixed(2)}`}</p>
              </div>
              <ul className="mt-1.5 text-xs text-[var(--text-main)]">
                {o.items.map((i, n) => (
                  <li key={n}>{i.quantity} × {i.name}{i.note && <span className="text-[var(--text-muted)]"> ({i.note})</span>}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-bold text-red-500">{o.error}</p>
              <div className="flex gap-2 mt-3">
                <button disabled={busy} onClick={() => act(retryFailedOrder, o.localId)} className={`${btn} border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--bg-card)]`}><RotateCcw size={12} /> Riprova</button>
                <button disabled={busy} onClick={() => act(discardFailedOrder, o.localId)} className={`${btn} border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--bg-card)]`}><Trash2 size={12} /> Elimina</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FailedOrdersModal;
