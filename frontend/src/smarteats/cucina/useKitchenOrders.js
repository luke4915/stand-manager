import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { withLineStatus } from './board';

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

  // Cambia lo stato di alcune righe di una comanda: si vede subito a schermo, poi si rilegge dal server
  const setLines = useCallback(async (order, lineIds, status) => {
    setOrders(list => withLineStatus(list, order.id, lineIds, status));
    try { await fetchWithAuth(`/orders/${order.id}/lines`, { method: 'PUT', body: { status, line_ids: lineIds } }); }
    catch (err) { showToast(err.message, 'error'); }
    load();
  }, [load, showToast]);

  return { orders, setLines };
}
