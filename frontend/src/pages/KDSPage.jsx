import { useEffect, useState, useRef, useMemo } from 'react';
import { ChefHat, Wifi, WifiOff } from 'lucide-react';
import { WS_URL } from '../config/api';
import { apiFetch } from '../utils/apiClient';

const mergeOrders = (existing, incoming) => {
    const map = new Map();
    for (const o of existing) map.set(o.id, o);
    for (const o of incoming) map.set(o.id, o);
    return Array.from(map.values()).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

// ─── Cumulativo (solo lettura) ─────────────────────────────────
const CumulativeQueue = ({ orders }) => {
    const queue = useMemo(() => {
        const map = {};
        orders.forEach(o => o.items?.forEach(item => {
            const key = `${item.name}__${item.note || ''}`;
            if (!map[key]) map[key] = { name: item.name, note: item.note || '', quantity: 0 };
            map[key].quantity += Number(item.quantity || 0);
        }));
        return Object.values(map).sort((a, b) => b.quantity - a.quantity);
    }, [orders]);

    if (!queue.length) return (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/30">
            <ChefHat size={40} />
            <p className="text-xs font-black uppercase tracking-widest">Tutto pronto!</p>
        </div>
    );

    return (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {queue.map(item => (
                <div key={`${item.name}__${item.note}`}
                    className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <p className="font-black text-base uppercase tracking-tight text-white leading-tight">{item.name}</p>
                    {item.note && <p className="text-xs font-black uppercase text-yellow-400">⚠ {item.note}</p>}
                    <span className="text-5xl font-black tabular-nums text-[var(--accent)] leading-none">{item.quantity}</span>
                </div>
            ))}
        </div>
    );
};

// ─── Card ordine (solo lettura) ────────────────────────────────
const OrderCard = ({ order }) => {
    const age = Math.floor((Date.now() - new Date(order.created_at)) / 60000);
    const urgent = age >= 10;
    const orderCode = order.display_code || order.id;

    return (
        <div className={`rounded-2xl p-4 border transition-all ${urgent ? 'bg-red-500/10 border-red-500/40' : 'bg-white/5 border-white/10'}`}>
            <div className="flex justify-between items-center mb-3">
                <span className="font-black text-xl text-white">#{orderCode}</span>
                {order.table_name && (
                    <span className="px-2 py-0.5 bg-white/10 border border-white/30 text-white rounded-full text-[11px] font-black uppercase">
                        {order.table_name}{order.covers > 0 && ` · ${order.covers} cop.`}
                    </span>
                )}
                {order.is_takeaway && (
                    <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full text-[9px] font-black uppercase">Asporto</span>
                )}
                <span className={`text-xs font-black tabular-nums ${urgent ? 'text-red-400' : 'text-white/40'}`}>
                    {new Date(order.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    {urgent && ' ⚠'}
                </span>
            </div>
            <ul className="space-y-1.5">
                {order.items?.map((item, idx) => (
                    <li key={idx}>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[var(--accent)] font-black">×{item.quantity}</span>
                            <span className="font-bold text-sm text-white uppercase">{item.name}</span>
                        </div>
                        {item.note && (
                            <div className="ml-5 mt-0.5 px-2 py-0.5 bg-yellow-500/10 border-l-2 border-yellow-400 text-xs text-yellow-400 font-black uppercase">
                                {item.note}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

// ─── Pagina KDS ────────────────────────────────────────────────
export default function KDS() {
    const [orders, setOrders] = useState([]);
    const [wsConnected, setWsConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [disabled, setDisabled] = useState(false); // modulo KDS spento per questo locale
    const disabledRef = useRef(false);
    const wsRef = useRef(null);
    const reconnectTimer = useRef(null);

    useEffect(() => {
        const connectWS = () => {
            wsRef.current = new WebSocket(`${WS_URL}?kds=public`);
            wsRef.current.onopen = () => setWsConnected(true);
            wsRef.current.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'order_created' || msg.type === 'new_order') {
                        if (msg.order.status === 'pending' || msg.order.status === 'preparing')
                            setOrders(prev => mergeOrders(prev, [msg.order]));
                    } else if (msg.type === 'order_updated') {
                        if (msg.order.status === 'completed' || msg.order.status === 'canceled')
                            setOrders(prev => prev.filter(o => o.id !== msg.order.id));
                        else
                            setOrders(prev => prev.map(o => o.id === msg.order.id ? msg.order : o));
                    } else if (msg.type === 'session_ended') {
                        setOrders([]);
                    }
                } catch (err) { console.error('WS parse error:', err); }
            };
            wsRef.current.onclose = () => {
                setWsConnected(false);
                if (!disabledRef.current) reconnectTimer.current = setTimeout(connectWS, 3000);
            };
            wsRef.current.onerror = () => wsRef.current?.close();
        };

        const loadOrders = async () => {
            try {
                const data = await apiFetch('/orders/kds');
                setOrders(prev => mergeOrders(prev, data));
            } catch (err) {
                if (err.code === 'MODULE_DISABLED') {
                    disabledRef.current = true;
                    setDisabled(true);
                    clearTimeout(reconnectTimer.current);
                    wsRef.current?.close();
                    return;
                }
                console.warn('KDS: caricamento ordini non riuscito, si attendono gli aggiornamenti in tempo reale', err);
            } finally {
                setLoading(false);
            }
        };

        connectWS();
        loadOrders();

        return () => {
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, []);

    const pending = useMemo(() => {
        return orders.filter(o => o.status === 'pending' || o.status === 'preparing');
    }, [orders]);

    if (disabled) return (
        <div className="min-h-screen bg-[var(--bg-main)] text-white flex items-center justify-center p-6">
            <p className="text-sm font-black uppercase tracking-widest text-white/50 text-center">Schermo cucina non attivo per questo locale</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[var(--bg-main)] text-white flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[var(--accent)] rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg shadow-[var(--accent-shadow)]">S</div>
                    <div>
                        <p className="font-black text-lg tracking-tight leading-none">KDS — Cucina</p>
                        <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-0.5">{pending.length} ordini in attesa</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {wsConnected
                        ? <><Wifi size={18} className="text-green-400" /><span className="text-xs font-black uppercase text-green-400">Live</span></>
                        : <><WifiOff size={18} className="text-red-400" /><span className="text-xs font-black uppercase text-red-400">Offline</span></>
                    }
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center text-white/30">
                    <p className="text-sm font-black uppercase tracking-widest">Caricamento...</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                    {/* Cumulativo */}
                    <div className="lg:w-[420px] xl:w-[480px] flex flex-col border-b lg:border-b-0 lg:border-r border-white/10">
                        <div className="px-5 py-3 border-b border-white/10 shrink-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Coda cumulativa</p>
                            <p className="text-xs text-white/30 mt-0.5">Totale da preparare</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                            <CumulativeQueue orders={pending} />
                        </div>
                    </div>

                    {/* Ordini */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="px-5 py-3 border-b border-white/10 shrink-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Ordini in coda</p>
                            <p className="text-xs text-white/30 mt-0.5">Dal più vecchio</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                            {pending.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/30">
                                    <ChefHat size={40} />
                                    <p className="text-xs font-black uppercase tracking-widest">Nessun ordine in attesa</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {pending.map(order => <OrderCard key={order.id} order={order} />)}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}