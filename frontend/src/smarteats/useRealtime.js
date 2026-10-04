import { useEffect, useRef } from 'react';
import { WS_URL, WS_CLOSE_UNAUTHORIZED } from '../config/api';
import { useAuth } from '../context/useAuth';

// Connessione WebSocket del personale: chiama `onMessage(msg)` per ogni evento del locale e si riconnette da sola.
export function useRealtime(onMessage) {
  const { user, refreshSession } = useAuth();
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; });

  useEffect(() => {
    if (!user) return;
    let ws, timer, closed = false;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        try { handler.current(JSON.parse(event.data)); } catch (err) { console.error('WS Parsing Error', err); }
      };
      ws.onclose = async (event) => {
        if (closed) return;
        // Token scaduto: si rinnova prima di riprovare.
        if (event.code === WS_CLOSE_UNAUTHORIZED && !(await refreshSession())) return;
        timer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [user, refreshSession]);
}
