import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Check, Camera, ChefHat } from 'lucide-react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

import { API_URL, WS_URL, WS_CLOSE_UNAUTHORIZED } from '../../config/api';

const mergeOrders = (existing, incoming) => {
  const map = new Map();
  for (const o of existing) map.set(o.id, o);
  for (const o of incoming) map.set(o.id, o);
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

// ─── Singolo ordine ─────────────────────────────────────────────
const OrderCard = ({ order, onComplete }) => {
  const orderCode = order.display_code || order.id;

  return (
    <div className={`rounded-xl p-4 border-l-4 transition-all ${
      order.status === 'completed' ? 'bg-[var(--bg-card)] border-green-500/40 opacity-40' :
      order.status === 'canceled' ? 'bg-[var(--bg-card)] border-red-500/40 opacity-30' :
      'bg-[var(--bg-card)] border-[var(--accent)] shadow-sm'
    }`}>
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className={`font-black text-sm tracking-widest uppercase ${
            order.status === 'completed' || order.status === 'canceled'
              ? 'line-through text-[var(--text-muted)]'
              : 'text-[var(--text-main)]'
          }`}>#{orderCode}</span>
          {order.is_takeaway && (
            <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full text-[9px] font-black uppercase">Asporto</span>
          )}
          {order.status === 'canceled' && (
            <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full text-[9px] font-black uppercase">Stornato</span>
          )}
          {order.status === 'completed' && (
            <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full text-[9px] font-black uppercase">Completato</span>
          )}
        </div>
        <span className="text-[10px] font-bold text-[var(--text-muted)] tabular-nums">
          {order.created_at
            ? new Date(order.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
            : ''}
        </span>
      </div>

      <ul className="space-y-1.5 mb-3">
        {order.items?.map((item, idx) => (
          <li key={idx}>
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--accent)] font-black text-sm">×{item.quantity}</span>
              <span className="font-bold text-sm text-[var(--text-main)] uppercase">{item.name}</span>
            </div>
            {item.note && (
              <div className="ml-6 mt-0.5 px-2 py-0.5 bg-yellow-500/10 border-l-2 border-yellow-400 text-xs text-yellow-500 font-black uppercase">
                {item.note}
              </div>
            )}
          </li>
        ))}
      </ul>

      {order.status !== 'completed' && order.status !== 'canceled' && (
        <button onClick={() => onComplete(order)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.99]">
          <Check size={14} /> PRONTO
        </button>
      )}
    </div>
  );
};

// ─── Componente principale ──────────────────────────────────────
const OrdersKitchen = () => {
  const { user, loading, refreshSession } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState('');

  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/orders?session=active`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrders(prev => mergeOrders(prev, data));
      }
    } catch {
      showToast('Errore caricamento ordini', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (loading || !user) return;

    let isMounted = true;

    const connectWS = () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'order_created' || msg.type === 'new_order') {
            setOrders(prev => mergeOrders(prev, [msg.order]));
            showToast('Nuovo ordine ricevuto!', 'info');
          } else if (msg.type === 'order_updated') {
            setOrders(prev => prev.map(o => o.id === msg.order.id ? msg.order : o));
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      wsRef.current.onclose = async (event) => {
        if (!isMounted) return;
        // Token scaduto o non valido: rinnoviamo il cookie prima di riprovare.
        if (event.code === WS_CLOSE_UNAUTHORIZED && !(await refreshSession())) return;
        if (isMounted) reconnectTimer.current = setTimeout(connectWS, 5000);
      };

      wsRef.current.onerror = (err) => {
        console.warn('WebSocket error encountered:', err);
      };
    };

    connectWS();
    loadOrders();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [user, loading, loadOrders, refreshSession]);

  const markAsCompleted = async (targetOrderOrId) => {
    const targetId = typeof targetOrderOrId === 'object' ? targetOrderOrId.id : targetOrderOrId;
    const orderObj = typeof targetOrderOrId === 'object' 
      ? targetOrderOrId 
      : orders.find(o => o.id === targetId);

    const displayCode = orderObj?.display_code || targetId;

    try {
      const res = await fetch(`${API_URL}/orders/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error();
      setOrders(prev => prev.map(o => o.id === targetId ? { ...o, status: 'completed' } : o));
      showToast(`Ordine #${displayCode} completato!`, 'success');
    } catch {
      showToast('Errore aggiornamento ordine', 'error');
    }
  };

  const parseBarcode = (code) => {
    if (!code.startsWith('ORD')) return null;
    try { return parseInt(code.slice(3, 9), 36); } catch { return null; }
  };

  const startScanner = async () => {
    setScannerError('');
    if (!navigator.mediaDevices?.getUserMedia) { setScannerError('Fotocamera non disponibile.'); return; }
    setScanning(true);
    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (result) {
          const id = parseBarcode(result.text);
          if (id) { markAsCompleted(id); stopScanner(); }
          else setScannerError('Codice non valido.');
        } else if (err && !(err instanceof NotFoundException)) {
          setScannerError('Errore lettura barcode.');
        }
      });
    } catch { setScannerError('Errore accesso fotocamera.'); setScanning(false); }
  };

  const stopScanner = () => {
    setScanning(false);
    codeReaderRef.current?.reset();
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const pending = orders.filter(o => o.status === 'pending' || o.status === 'preparing');
  const completed = orders.filter(o => o.status === 'completed');
  const canceled = orders.filter(o => o.status === 'canceled');

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-[var(--text-main)]">CUCINA</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">
            {pending.length} in attesa · {completed.length} completati · {canceled.length} stornati
          </p>
        </div>
        <button onClick={scanning ? stopScanner : startScanner}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all ${
            scanning ? 'bg-red-500' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
          }`}>
          <Camera size={16} /> {scanning ? 'Ferma' : 'Scansiona QR'}
        </button>
      </div>

      {/* Scanner */}
      {scanning && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] flex flex-col items-center gap-3 shrink-0">
          <div className="relative w-full max-w-xs aspect-video rounded-xl overflow-hidden border-2 border-[var(--accent)]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 border-2 border-dashed border-white/30 m-4 pointer-events-none rounded-lg" />
          </div>
          {scannerError && <p className="text-red-500 text-xs font-bold">{scannerError}</p>}
        </div>
      )}

      {/* Lista ordini */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--text-muted)]">
            <ChefHat size={28} className="mb-2 opacity-30" />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Nessun ordine</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orders.map(order => (
              <OrderCard key={order.id} order={order} onComplete={markAsCompleted} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersKitchen;