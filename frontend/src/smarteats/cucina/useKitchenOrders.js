import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { withStatus } from './board';

const REFRESH_MS = 30000;

// Le comande della cucina: da preparare, in preparazione e quelle in arrivo (portate non ancora mandate). Si rileggono
// a ogni evento del locale e ogni 30 secondi, così un evento perso non lascia il monitor indietro.
export function useKitchenOrders(event) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState(null);

  const load = useCallback(async () => {
    try { setOrders(await fetchWithAuth('/orders?session=active&status=scheduled,pending,preparing')); }
    catch (err) { showToast(err.message || 'Errore caricamento comande', 'error'); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (event && ['order_created', 'order_updated', 'check_updated'].includes(event.type)) load(); }, [event, load]);
  useEffect(() => { const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, [load]);

  // Avanza una comanda (in preparazione → pronta); si aggiorna subito a schermo e poi si rilegge
  const advance = useCallback(async (order, status) => {
    setOrders(list => withStatus(list, order.id, status));
    try { await fetchWithAuth(`/orders/${order.id}`, { method: 'PUT', body: { status } }); }
    catch (err) { showToast(err.message, 'error'); }
    load();
  }, [load, showToast]);

  return { orders, advance };
}
