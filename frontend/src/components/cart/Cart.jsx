import React, { useState, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { getFullTotal, getDiscountedTotal } from '../../utils/pricing';
import { cartKey, mergeCartItems } from './cartUtils';

import CartDesktopView from './desktop/CartDesktopView';
import CartMobileView from './mobile/CartMobileView';
import CartItemModal from './modals/CartItemModal';
import ReprintSelectionModal from './modals/ReprintSelectionModal';
import QRScanModal from './modals/QRScanModal';
import ClearCartModal from './modals/ClearCartModal';

// ─── Componente Cart Principale (Container Logico) ────────────────
// Gestisce solo stato/orchestrazione: la UI vera vive in CartDesktopView /
// CartMobileView, e le modali di business logic sono in ./modals.
const Cart = ({ cart, setCart, total, addToCart, removeFromCart, removeLastItem, clearCart, sendOrder, sessionActive, children, onClose, setShowReversePopup, updateItemType, applyOrderDiscount, canDiscount }) => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [amountReceived, setAmountReceived] = useState('');
  const [change, setChange] = useState(0);
  const [isReprintModalOpen, setIsReprintModalOpen] = useState(false);
  const [isQRScanModalOpen, setIsQRScanModalOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isTakeaway, setIsTakeaway] = useState(false);

  const isMobile = useIsMobile();

  useEffect(() => {
    const received = parseFloat(amountReceived.replace(',', '.')) || 0;
    setChange(received - total);
  }, [amountReceived, total]);

  // Reset del campo "ricevuti" e del flag "asporto" quando il carrello viene svuotato
  // (sia post-ordine che tramite svuotamento manuale)
  useEffect(() => {
    if (!cart || cart.length === 0) {
      setAmountReceived('');
      setIsTakeaway(false);
    }
  }, [cart]);

  const handleNoteChange = (item, note) => {
    const oldKey = cartKey(item);
    const newNote = note || '';

    // Simuliamo quale sarà la chiave della riga DOPO aver modificato la nota
    const newKey = cartKey({ ...item, note: newNote });

    setCart(prev => {
      // Se l'utente non ha cambiato davvero la nota, usciamo subito
      if (oldKey === newKey) return prev;

      const nextCart = [...prev];
      const sourceIndex = nextCart.findIndex(i => cartKey(i) === oldKey);

      if (sourceIndex === -1) return prev; // Riga non trovata per sicurezza

      const sourceItem = nextCart[sourceIndex];

      // Cerchiamo se ESISTE GIA' un'altra riga con questo prodotto e questa nuova nota
      const targetIndex = nextCart.findIndex(i => cartKey(i) === newKey);

      if (targetIndex !== -1 && targetIndex !== sourceIndex) {
        // 💥 COLLISIONE RILEVATA!
        // Sommiamo la quantità della riga attuale a quella già esistente
        nextCart[targetIndex] = {
          ...nextCart[targetIndex],
          quantity: nextCart[targetIndex].quantity + sourceItem.quantity
        };
        // Eliminiamo la riga duplicata
        nextCart.splice(sourceIndex, 1);
      } else {
        // Nessuna collisione: ci limitiamo ad aggiornare la nota della riga
        nextCart[sourceIndex] = { ...sourceItem, note: newNote };
      }

      return nextCart;
    });

    // Aggiorniamo il selectedItem per far sì che la modale non si chiuda e segua 
    // l'elemento fuso correttamente.
    setSelectedItem(prev => prev ? { ...prev, note: newNote } : prev);
  };

  const handleSendOrder = async () => {
    if (!sessionActive) return;
    try {
      await sendOrder(isTakeaway);
    } finally {
      // Reset garantito di contanti ricevuti e asporto sia in caso di successo che di errore
      setAmountReceived('');
      setIsTakeaway(false);
    }
  };

  const handleConfirmClearCart = () => {
    clearCart(true);
    setAmountReceived('');
    setIsTakeaway(false);
    setIsClearModalOpen(false);
  };

  const handleQRReplace = (items) => {
    setCart(items.map(i => ({ ...i, note: i.note || '' })));
    setIsQRScanModalOpen(false);
  };

  const handleQRMerge = (items) => {
    setCart(prev => {
      const nextCart = [...prev];

      items.forEach(newItem => {
        const newKey = cartKey(newItem);
        const idx = nextCart.findIndex(i => cartKey(i) === newKey);

        if (idx >= 0) {
          // Accorpa le quantità se la chiave combacia
          nextCart[idx] = { ...nextCart[idx], quantity: nextCart[idx].quantity + newItem.quantity };
        } else {
          // Aggiungi la nuova riga
          nextCart.push({ ...newItem, note: newItem.note || '' });
        }
      });

      return nextCart;
    });
    setIsQRScanModalOpen(false);
  };

  const mergedCart = mergeCartItems(cart);
  const currentSelected = selectedItem ? mergedCart.find(i => cartKey(i) === cartKey(selectedItem)) : null;
  const isAllGift = cart.length > 0 && cart.every(i => i.type === 'gift');
  const fullTotal = getFullTotal(cart);

  // Calcolo sincrono del totale scontato per evitare delay dal genitore
  const currentDiscountedTotal = getDiscountedTotal(cart);
  const hasAnyDiscount = cart.length > 0 && currentDiscountedTotal < fullTotal - 0.001;

  // Se tutto il carrello condivide lo stesso adjustment, lo riflettiamo nello slider
  // del pannello sconto ordine; se sono misti (sconti diversi riga per riga), torniamo null.
  const derivedOrderPercent = (() => {
    if (cart.length === 0) return 0;
    if (cart.every(i => i.type === 'sale')) return 0;
    if (cart.every(i => i.type === 'gift')) return 100;
    const first = cart[0];
    const uniform = cart.every(i => i.type === 'discount' && i.discountMode === 'percent' && i.discountValue === first.discountValue);
    return uniform && first.type === 'discount' ? first.discountValue : null;
  })();

  // Bundle unificato delle props da distribuire ai sotto-render visivi
  const sharedViewProps = {
    cart,
    mergedCart,
    cartKey,
    total,
    fullTotal,
    hasAnyDiscount,
    amountReceived,
    setAmountReceived,
    change,
    sessionActive,
    handleSendOrder,
    setSelectedItem,
    setIsQRScanModalOpen,
    setIsReprintModalOpen,
    setIsClearModalOpen,
    children,
    onClose,
    applyOrderDiscount,
    canDiscount,
    isAllGift,
    derivedOrderPercent,
    isTakeaway,
    setIsTakeaway,
    setShowReversePopup
  };

  return (
    <>
      {isMobile ? (
        <CartMobileView {...sharedViewProps} />
      ) : (
        <CartDesktopView {...sharedViewProps} />
      )}

      {/* Controllo globale delle Modali di Business Logic */}
      {currentSelected && (
        <CartItemModal
          item={currentSelected}
          onClose={() => setSelectedItem(null)}
          onAdd={addToCart}
          onRemove={removeLastItem}
          onDelete={removeFromCart}
          onNoteChange={handleNoteChange}
          onTypeChange={updateItemType}
          canDiscount={canDiscount}
        />
      )}
      {isReprintModalOpen && <ReprintSelectionModal onClose={() => setIsReprintModalOpen(false)} />}
      {isClearModalOpen && <ClearCartModal onConfirm={handleConfirmClearCart} onClose={() => setIsClearModalOpen(false)} />}
      {isQRScanModalOpen && <QRScanModal currentCart={cart} onMerge={handleQRMerge} onReplace={handleQRReplace} onClose={() => setIsQRScanModalOpen(false)} />}
    </>
  );
};

export default Cart;