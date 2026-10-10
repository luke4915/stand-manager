import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth, NetworkError } from '../utils/apiClient';
import { saveProducts, loadCachedProducts } from '../offline/productsCache';

const normalize = (list) => list.map(p => ({ ...p, price: parseFloat(p.price) }));

// Catalogo prodotti: dal server, e senza connessione dall'ultima copia salvata in locale.
// `enabled` è false finché l'utente non è autenticato.
export function useProducts(enabled) {
  const [products, setProducts] = useState([]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchWithAuth('/products');
      setProducts(normalize(data));
      saveProducts(data).catch(console.error);
    } catch (err) {
      if (err instanceof NetworkError) setProducts(normalize(await loadCachedProducts()));
    }
  }, []);

  useEffect(() => {
    if (enabled) loadProducts();
  }, [enabled, loadProducts]);

  return { products, setProducts, loadProducts };
}
