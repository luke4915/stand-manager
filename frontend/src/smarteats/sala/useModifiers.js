import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';

// I gruppi di modificatori del locale (con le opzioni), e quali toccano un prodotto. Si caricano una volta; `reload`
// li rilegge dopo una modifica nella Carta.
export function useModifiers() {
  const [groups, setGroups] = useState([]);
  const reload = useCallback(() => fetchWithAuth('/modifier-groups').then(setGroups).catch(() => setGroups([])), []);
  useEffect(() => { reload(); }, [reload]);
  const forProduct = useCallback((product) => groups.filter(g => g.product_ids.includes(product.id)), [groups]);
  return { groups, forProduct, reload };
}
