import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';

// Il dettaglio di un conto, riletto quando un altro dispositivo lo modifica (eventi in tempo reale).
// `onGone` si chiama se il conto non si può più leggere.
export function useCheckDetail(checkId, event, onGone) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState(null);

  const reload = useCallback(async () => {
    try { setDetail(await fetchWithAuth(`/checks/${checkId}`)); }
    catch (err) { showToast(err.message, 'error'); onGone?.(); }
  }, [checkId, showToast, onGone]);

  useEffect(() => { setDetail(null); reload(); }, [reload]);
  useEffect(() => {
    const touched = (event?.type === 'check_updated' && event.check.id === checkId) || (event?.type === 'order_updated' && event.order.check_id === checkId);
    if (touched) reload();
  }, [event, checkId, reload]);

  return { detail, reload };
}
