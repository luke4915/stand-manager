import { useEffect, useMemo, useState } from 'react';
import { getDiscountedTotal } from '../utils/pricing';

// Due righe del carrello sono lo stesso articolo se hanno lo stesso prodotto e la stessa nota.
const sameLine = (a, b) => a.id === b.id && (a.note || '') === (b.note || '');

// Il carrello della cassa: vive solo nel browser (sessionStorage, così sopravvive a un ricaricamento)
// finché l'ordine non viene inviato. `total` è sempre quello reale da incassare, già al netto
// di sconti e omaggi.
export function useCart({ showToast, playSound }) {
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('cart') || '[]'); }
    catch { return []; }
  });
  useEffect(() => { sessionStorage.setItem('cart', JSON.stringify(cart)); }, [cart]);

  const total = useMemo(() => getDiscountedTotal(cart), [cart]);

  // Ritorna false se il prodotto non è disponibile nella quantità richiesta.
  const addToCart = (product, requestedQty = 1) => {
    if (product.stock_enabled && product.stock !== null) {
      const inCart = cart.filter(i => i.id === product.id).reduce((sum, i) => sum + i.quantity, 0);
      if (inCart + requestedQty > product.stock) {
        showToast(`Prodotto "${product.name}" esaurito o quantità massima raggiunta!`, 'warning');
        return false;
      }
    }

    playSound('product_select_sound');
    setCart(prev => {
      if (prev.some(i => sameLine(i, product))) {
        return prev.map(i => sameLine(i, product) ? { ...i, quantity: i.quantity + requestedQty } : i);
      }
      // Ogni nuovo prodotto entra come vendita piena, senza sconto/omaggio
      return [...prev, { ...product, quantity: requestedQty, type: 'sale', discountMode: null, discountValue: null }];
    });
    return true;
  };

  // Applica un adjustment (vendita normale / omaggio / sconto %-€) a UNA riga del carrello.
  const updateItemType = (item, newType, discountMode = null, discountValue = null) => {
    setCart(prev => prev.map(i => sameLine(i, item)
      ? {
        ...i,
        type: newType,
        discountMode: newType === 'discount' ? discountMode : null,
        discountValue: newType === 'discount' ? discountValue : null,
      }
      : i
    ));
  };

  // Applica in blocco una percentuale di sconto a TUTTO il carrello.
  // 0 -> tutti 'sale', 100 -> tutti 'gift' (omaggio), valori intermedi -> 'discount' percent.
  const applyOrderDiscount = (percent) => {
    const pct = Math.min(100, Math.max(0, Number(percent) || 0));
    setCart(prev => prev.map(i => {
      if (pct <= 0) return { ...i, type: 'sale', discountMode: null, discountValue: null };
      if (pct >= 100) return { ...i, type: 'gift', discountMode: null, discountValue: null };
      return { ...i, type: 'discount', discountMode: 'percent', discountValue: pct };
    }));
  };

  const clearCart = (isManual = false) => { if (isManual) playSound('empty_cart_sound'); setCart([]); };
  const removeFromCart = (product) => setCart(prev => prev.filter(i => !sameLine(i, product)));
  const removeLastItem = (product) => setCart(prev => prev
    .map(i => sameLine(i, product) ? { ...i, quantity: i.quantity - 1 } : i)
    .filter(i => i.quantity > 0));

  return { cart, setCart, total, addToCart, updateItemType, applyOrderDiscount, clearCart, removeFromCart, removeLastItem };
}
