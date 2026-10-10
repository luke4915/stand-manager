import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth, NetworkError } from '../utils/apiClient';
import { remember, recall } from '../offline/lastKnown';

// La sessione di lavoro (la "serata"): { id, name } se ce n'è una aperta, altrimenti null.
// Senza sessione aperta non si battono ordini. Lo stato arrivato dal server si ricorda in locale,
// così dopo un ricaricamento senza rete la cassa può continuare a battere ordini in coda.
export function useWorkSession(enabled) {
  const [activeSession, setActiveSession] = useState(null);

  const applySession = useCallback((session) => {
    setActiveSession(session);
    remember('activeSession', session);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchWithAuth('/sessions/latest')
      .then(data => applySession(data && !data.end_time ? { id: data.id, name: data.name } : null))
      .catch(err => {
        if (err instanceof NetworkError) setActiveSession(recall('activeSession'));
      });
  }, [enabled, applySession]);

  const startSession = async (name) => {
    const data = await fetchWithAuth('/sessions/start', { method: 'POST', body: { name } });
    applySession({ id: data.id, name: data.name });
    return data;
  };

  // `openOrders`: cosa fare degli ordini ancora aperti ('complete' | 'leave'), vedi EndSessionModal.
  const endSession = async (declaredCash, openOrders) => {
    await fetchWithAuth('/sessions/end', { method: 'POST', body: { declaredCash, openOrders } });
    applySession(null);
  };

  return { activeSession, applySession, startSession, endSession };
}
