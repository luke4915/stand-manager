import React, { useState, useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { fetchWithAuth, NetworkError } from '../../../utils/apiClient';
import { useToast } from '../../../context/useToast';
import { reprintOrder, reprintLocal } from '../../../print/printOrder';
import { recentLocalOrders } from '../../../print/localOrders';
import { recall } from '../../../offline/lastKnown';

const MAX_ORDERS = 10;

// Elenco ordini ristampabili: quelli del server (se raggiungibile) e quelli archiviati su questa cassa,
// che coprono anche gli ordini non ancora sincronizzati. Dallo stesso ordine si tiene un solo elemento.
async function loadReprintable() {
    const sessionId = recall('activeSession')?.id;
    const [serverRes, local] = await Promise.all([
        fetchWithAuth('/orders?session=active').then(rows => rows.filter(o => o.status !== 'canceled'), () => null),
        sessionId ? recentLocalOrders(sessionId, MAX_ORDERS * 3) : [],
    ]);
    const localByCode = new Map(local.map(o => [o.display_code, o]));
    const entries = (serverRes ?? []).map(o => ({ ...o, serverId: o.id, clientOrderId: localByCode.get(o.display_code)?.clientOrderId }));
    const known = new Set(entries.map(o => o.display_code));
    for (const o of local) if (!known.has(o.display_code)) entries.push(o);
    entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { orders: entries.slice(0, MAX_ORDERS).map(o => ({ ...o, key: o.serverId ?? o.clientOrderId })), offline: serverRes === null };
}

// ─── Modale Ristampa ────────────────────────────────────────────
const ReprintSelectionModal = ({ onClose }) => {
    const { showToast } = useToast();
    const [recentOrders, setRecentOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reprintingId, setReprintingId] = useState(null);

    const [offline, setOffline] = useState(false);

    useEffect(() => {
        loadReprintable()
            .then(({ orders, offline }) => { setRecentOrders(orders); setOffline(offline); })
            .catch(() => setError('Impossibile recuperare gli ordini'))
            .finally(() => setLoading(false));
    }, []);

    const handleReprint = async (order) => {
        setReprintingId(order.key);
        try {
            let printed = 0;
            try {
                if (!order.serverId) throw new NetworkError();
                // Il server registra la ristampa e restituisce l'ordine; la stampa parte da questa cassa
                printed = await reprintOrder(await fetchWithAuth(`/orders/${order.serverId}/reprint`, { method: 'POST' }));
            } catch (err) {
                // Senza server (o ordine non ancora sincronizzato) si ristampa dall'archivio locale
                if (!(err instanceof NetworkError) || !order.clientOrderId) throw err;
                printed = await reprintLocal(order.clientOrderId);
            }
            if (!printed) throw new Error('nessuna stampante configurata');
            onClose();
        } catch (err) {
            showToast(`Errore durante la ristampa: ${err.message}`, 'error');
        } finally {
            setReprintingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Ristampa</p>
                        <h3 className="font-black text-sm uppercase tracking-tight text-[var(--text-main)]">Seleziona scontrino</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-[var(--bg-card-2)] cursor-pointer border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-main)] transition-colors"><X size={15} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                    {loading && <p className="text-xs text-center py-4 text-[var(--text-muted)]">Caricamento...</p>}
                    {error && <p className="text-xs text-center py-4 text-red-500">{error}</p>}
                    {offline && !loading && <p className="text-[10px] text-center text-amber-500">Sei offline: sono disponibili gli ordini battuti da questa cassa.</p>}
                    {!loading && !error && recentOrders.length === 0 && <p className="text-xs text-center py-4 text-[var(--text-muted)]">Nessun ordine trovato.</p>}
                    {!loading && !error && recentOrders.map(order => (
                        <div key={order.key} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)]">
                            <div className="min-w-0 flex-1 pr-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-black text-xs text-[var(--text-main)]">#{order.display_code || order.id}</span>
                                    <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{new Date(order.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{order.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || '—'}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="font-black text-xs text-[var(--accent)] tabular-nums">{Number(order.total).toFixed(2)} €</span>
                                <button disabled={reprintingId !== null} onClick={() => handleReprint(order)}
                                    className="p-2 rounded-lg bg-[var(--accent)] border-[var(--border-accent)] cursor-pointer hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white transition-colors">
                                    <Printer size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReprintSelectionModal;