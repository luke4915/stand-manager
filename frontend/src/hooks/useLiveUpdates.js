import { useEffect, useRef, useState } from 'react';
import { WS_URL, WS_CLOSE_UNAUTHORIZED } from '../config/api';

// Collegamento in tempo reale col server (WebSocket): riceve gli eventi del tenant
// (`order_created`, `product_stock_updated`, `session_started`, …) e li passa a `onMessage`
// già decodificati. Se la connessione cade si ricollega da solo dopo `reconnectMs`.
//
// - `enabled`: false finché non serve (es. utente non ancora caricato).
// - `publicKds`: schermo cucina pubblico, senza login; riceve solo gli eventi ridotti (vedi backend/ws.js).
// - `onUnauthorized`: chiamata quando il server chiude per token scaduto (4401); deve rinnovare
//   la sessione e restituire true se ci è riuscita. Se restituisce false non ci si ricollega.
//
// Restituisce `connected`, per mostrare lo stato della connessione.
export function useLiveUpdates(onMessage, { enabled = true, publicKds = false, reconnectMs = 3000, onUnauthorized } = {}) {
  const [connected, setConnected] = useState(false);

  // L'ultima versione delle funzioni passate, senza dover riaprire la connessione a ogni render.
  const onMessageRef = useRef(onMessage);
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onUnauthorizedRef.current = onUnauthorized;
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true; // diventa false quando il componente si smonta: niente più riconnessioni
    let socket = null;
    let reconnectTimer = null;

    const connect = () => {
      socket = new WebSocket(publicKds ? `${WS_URL}?kds=public` : WS_URL);
      socket.onopen = () => setConnected(true);
      socket.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); }
        catch (err) { console.error('WebSocket: messaggio non leggibile', err); return; }
        onMessageRef.current(msg);
      };
      socket.onclose = async (event) => {
        setConnected(false);
        if (!active) return;
        // Token scaduto o non valido: si rinnova il cookie prima di riprovare.
        if (event.code === WS_CLOSE_UNAUTHORIZED && onUnauthorizedRef.current && !(await onUnauthorizedRef.current())) return;
        if (active) reconnectTimer = setTimeout(connect, reconnectMs);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null; // chiusura voluta: niente riconnessione
        socket.close();
      }
    };
  }, [enabled, publicKds, reconnectMs]);

  return connected;
}
