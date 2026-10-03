// ─── Pricing helper condiviso (frontend) ──────────────────────────────
// Specchia 1:1 la logica del backend (backend/utils/pricing.js).
// Serve solo per calcolare in tempo reale il totale mostrato in cassa;
// il valore "di verità" resta sempre quello ricalcolato dal server.
//
// item.type: 'sale' | 'gift' | 'discount'
// item.discountMode: 'percent' | 'amount'   (rilevante solo se type === 'discount')
// item.discountValue: number

// ─── Pricing helper condiviso (frontend) ──────────────────────────────

export const VALID_TYPES = ['sale', 'gift', 'discount'];
export const VALID_DISCOUNT_MODES = ['percent', 'amount'];

/**
 * Calcola il prezzo unitario effettivo di una riga carrello.
 */
export function getEffectivePrice(item) {
    const base = Number(item?.price) || 0;
    const qty = Number(item?.quantity) || 0;

    if (item?.type === 'gift') return 0;

    if (item?.type === 'discount') {
        const val = Number(item.discountValue) || 0;
        if (item.discountMode === 'amount') {
            // 🟢 ORA LO SCONTO È SULLA RIGA: lo dividiamo per la quantità complessiva
            const unitDiscount = qty > 0 ? val / qty : val;

            // Ritorniamo il valore esatto fluttuante (NON arrotondiamo qui con toFixed 
            // altrimenti perdiamo centesimi preziosi nella moltiplicazione successiva)
            return Math.max(0, base - unitDiscount);
        }
        const pct = Math.min(100, Math.max(0, val));
        return Math.max(0, base * (1 - pct / 100));
    }

    return base;
}

/** Totale di una riga (prezzo effettivo × quantità). */
export function getLineTotal(item) {
    // 🟢 L'arrotondamento monetario a 2 decimali si sposta SOLO qui, sul totale finito di riga
    const total = getEffectivePrice(item) * (Number(item?.quantity) || 0);
    return +total.toFixed(2);
}

/** Somma dei prezzi di listino (pre-sconto) del carrello. */
export function getFullTotal(cart) {
    return cart.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
}

/** Somma dei prezzi effettivi (post-sconto/omaggio) del carrello: quello da incassare davvero. */
export function getDiscountedTotal(cart) {
    return cart.reduce((sum, i) => sum + getLineTotal(i), 0);
}

/** Etichetta breve da mostrare accanto a una riga scontata/omaggiata. */
export function getAdjustmentLabel(item) {
    if (item?.type === 'gift') return 'OMAGGIO';
    if (item?.type === 'discount') {
        const val = Number(item.discountValue) || 0;
        return item.discountMode === 'amount' ? `-${val.toFixed(2)}€` : `-${val}%`;
    }
    return null;
}