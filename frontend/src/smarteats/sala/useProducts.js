import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';

// La carta (prodotti visibili), caricata quando serve; `enabled` false = non scaricare.
export function useProducts(enabled) {
  const { showToast } = useToast();
  const [products, setProducts] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    fetchWithAuth('/products')
      .then(list => setProducts(list.filter(p => p.visible !== false).map(p => ({ ...p, price: parseFloat(p.price) }))))
      .catch(err => showToast(err.message || 'Errore caricamento carta', 'error'));
  }, [enabled, showToast]);
  return products;
}
