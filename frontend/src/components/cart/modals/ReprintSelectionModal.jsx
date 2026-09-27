import React, { useState, useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { API_URL } from '../../../config/api';

// ─── Modale Ristampa ────────────────────────────────────────────
const ReprintSelectionModal = ({ onClose }) => {
    const [recentOrders, setRecentOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reprintingId, setReprintingId] = useState(null);

    useEffect(() => {
        fetch(`${API_URL}/orders?session=active`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                // Filtra escludendo gli ordini stornati, poi prende i primi 10
                const activeOrders = data
                    .filter(o => o.status !== 'canceled')
                    .slice(0, 10);
                setRecentOrders(activeOrders);
            })
            .catch(() => setError('Impossibile recuperare gli ordini'))
            .finally(() => setLoading(false));
    }, []);

    const handleReprint = async (orderId) => {
        setReprintingId(orderId);
        try {
            const res = await fetch(`${API_URL}/orders/${orderId}/reprint`, { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error();
            onClose();
        } catch {
            alert('Errore durante la ristampa');
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Ristampa Periferica</p>
                        <h3 className="font-black text-sm uppercase tracking-tight text-[var(--text-main)]">Seleziona scontrino</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-[var(--bg-card-2)] cursor-pointer border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-main)] transition-colors"><X size={15} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                    {loading && <p className="text-xs text-center py-4 text-[var(--text-muted)]">Caricamento...</p>}
                    {error && <p className="text-xs text-center py-4 text-red-500">{error}</p>}
                    {!loading && !error && recentOrders.length === 0 && <p className="text-xs text-center py-4 text-[var(--text-muted)]">Nessun ordine trovato.</p>}
                    {!loading && !error && recentOrders.map(order => (
                        <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)]">
                            <div className="min-w-0 flex-1 pr-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-black text-xs text-[var(--text-main)]">#{order.id}</span>
                                    <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{new Date(order.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{order.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || '—'}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="font-black text-xs text-[var(--accent)] tabular-nums">{Number(order.total).toFixed(2)} €</span>
                                <button disabled={reprintingId !== null} onClick={() => handleReprint(order.id)}
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