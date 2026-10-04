import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/apiClient';

// Il "servizio" (pranzo, cena…) è la sessione di lavoro del locale: serve aperto per avere conti e comande.
// Lato server è la stessa `sessions` delle sagre; il passo 2-10 lo rifinirà per i ristoranti.
export function useService() {
  const [service, setService] = useState(undefined); // undefined = non ancora caricato, null = nessun servizio aperto

  const reload = useCallback(async () => {
    const data = await fetchWithAuth('/sessions/latest');
    setService(data && !data.end_time ? { id: data.id, name: data.name } : null);
  }, []);
  useEffect(() => { reload().catch(() => setService(null)); }, [reload]);

  const start = async (name) => {
    const data = await fetchWithAuth('/sessions/start', { method: 'POST', body: { name } });
    setService({ id: data.id, name: data.name });
  };
  const closingInfo = () => fetchWithAuth('/sessions/expected-cash');
  const end = async (declaredCash, openOrders) => {
    await fetchWithAuth('/sessions/end', { method: 'POST', body: { declaredCash, openOrders } });
    setService(null);
  };

  // Gli eventi del server (un altro dispositivo apre o chiude) aggiornano lo stato senza ricaricare.
  const onEvent = (msg) => {
    if (msg.type === 'session_started') setService({ id: msg.session.id, name: msg.session.name });
    if (msg.type === 'session_ended') setService(null);
  };

  return { service, start, closingInfo, end, onEvent };
}
